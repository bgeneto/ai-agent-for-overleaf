'use strict';

import './contentScript.css';

import { Options, TextContent } from '../types';
import { Suggestion } from '../common/suggestion';
import { getOptions, postProcessToken } from '../utils/helper';
import { getSuggestion } from '../utils/suggestion';
import { BUILTIN_ACTIONS, PROMPTS } from '../prompts';
import { StatusBadge } from '../components/StatusBadge';
import { ToolbarEditor } from '../components/ToolbarEditor';
import { render, h } from 'preact';

// Declare Firefox-specific function
declare function cloneInto<T>(obj: T, targetScope: any, options?: { cloneFunctions?: boolean }): T;

let options: Options | undefined = undefined;
let suggestionAbortController: AbortController | null = null;
let improveAbortController: AbortController | null = null;
let isLoading = false;
let hasSelection = false;
let currentSelection: { content: TextContent; from: number; to: number; head: number } | null = null;
let justTriggeredCompletion = false; // Flag to prevent immediate abort after triggering completion

// Re-render the badge when state changes
function renderBadge() {
  const badgeContainer = document.getElementById('copilot-badge-container');
  if (badgeContainer) {
    render(
      h(StatusBadge, {
        onContinue: handleContinue,
        onImprove: () => handleAction(BUILTIN_ACTIONS.IMPROVE),
        onFix: () => handleAction(BUILTIN_ACTIONS.FIX),
        onAction: handleAction, // Generic handler for dynamic actions
        onSearch: handleSearch,
        hasSelection,
        isLoading,
        actions: options?.toolbarActions || []
      }),
      badgeContainer
    );
  }
}

// Handle "Continue Writing" action from menu
function handleContinue() {
  if (!options || options.suggestionDisabled) return;

  // Focus editor
  const editor = document.querySelector('.cm-content') as HTMLElement;
  if (editor) editor.focus();

  // If user has text selected, use the existing selection data directly
  // This ensures the selection is passed to buildContinuationPrompt correctly
  if (currentSelection && currentSelection.content.selection.trim().length > 0) {
    const action = {
      ...BUILTIN_ACTIONS.CONTINUE,
      prompt: options.suggestionPrompt || ''
    };
    openToolbarEditor(action, currentSelection);
    return;
  }

  // No selection - dispatch request to main world to get cursor context (before/after)
  window.dispatchEvent(new CustomEvent('copilot:menu:continue'));
}

// Handle continuation request from main world (response with context)
async function onContinueRequest(
  event: CustomEvent<{
    content: TextContent;
    head: number;
  }>
) {
  if (options == undefined || options.suggestionDisabled) return;

  // Construct selection object for ToolbarEditor
  const data = {
    content: event.detail.content,
    from: event.detail.head, // Empty selection at cursor
    to: event.detail.head,
    head: event.detail.head
  };

  // Use the CONTINUE action - prompt will be built by buildContinuationPrompt based on context
  const action = {
    ...BUILTIN_ACTIONS.CONTINUE,
    prompt: options.suggestionPrompt || '' // Custom prompt if provided
  };

  // Open the Toolbar Editor
  openToolbarEditor(action, data);
}

// Extracted logic from handleAction to allow passing explicit data
function openToolbarEditor(action: any, data: any) {
  improveAbortController?.abort();
  improveAbortController = new AbortController();

  // Remove any existing toolbar UI
  document.getElementById('copilot-toolbar')?.remove();
  document.getElementById('copilot-toolbar-editor')?.remove();

  // Find cursor position
  const cursor = document.querySelector('.cm-cursor-primary') as HTMLElement;
  if (!cursor) return;
  const rect = cursor.getBoundingClientRect();

  const toolbarEditor = document.createElement('div');
  toolbarEditor.setAttribute('id', 'copilot-toolbar-editor');

  // Position the editor
  toolbarEditor.style.top = `${rect.top + 30}px`;

  const scroller = document.querySelector('div.cm-scroller');
  let width = scroller?.getBoundingClientRect().width ?? 400;
  width = Math.min(Math.max(width, 400), 800);
  toolbarEditor.style.width = `${width}px`;
  toolbarEditor.style.left = `${Math.max(rect.left - width / 2, 0)}px`;

  document.body.appendChild(toolbarEditor);

  if (options) {
    render(h(ToolbarEditor, {
      action,
      data,
      options,
      signal: improveAbortController.signal
    }), toolbarEditor);
  }
}



// Handle generic action from menu
function handleAction(action: { name: string, prompt: string, icon: string }) {
  // Special handling for Explain Error
  if (action.prompt === 'EXPLAIN_ERROR') {
    handleExplainError(action);
    return;
  }

  if (!currentSelection) return;

  // Convert selection to editor data format
  const data = {
    content: currentSelection.content,
    from: currentSelection.from,
    to: currentSelection.to,
    head: currentSelection.head
  };

  openToolbarEditor(action, data);
}

// Handle "Explain Error" action
async function handleExplainError(action: { name: string, prompt: string, icon: string }) {
  // Find all log entries in the logs pane
  const logEntries = document.querySelectorAll('.logs-pane-content > .log-entry');
  let errorElement: Element | null = null;

  // Iterate to find the first relevant error, skipping the "No PDF" message
  // which is an info message that shouldn't be treated as an error to explain
  for (const entry of Array.from(logEntries)) {
    const title = entry.querySelector('.log-entry-header-title')?.textContent || "";
    // Robustly skip this specific Overleaf info message
    if (title.includes('No PDF') && title.includes('Stop on first error')) {
      continue;
    }

    // Skip "Raw logs" entry as it usually contains the full log even on success
    if (title.trim().toLowerCase() === 'raw logs') {
      continue;
    }
    errorElement = entry;
    break;
  }

  if (!errorElement) {
    alert("No active compilation error found in the logs pane.");
    return;
  }

  // Extract relevant text
  const title = errorElement.querySelector('.log-entry-header-title')?.textContent || "Unknown Error";
  const rawContent = errorElement.querySelector('.log-entry-content-raw')?.textContent || "";
  const formattedContent = errorElement.querySelector('.log-entry-formatted-content')?.textContent || "";

  // Combine context
  const errorCtx = `Title: ${title}\n\nMessage: ${formattedContent}\n\nRaw Log:\n${rawContent}`;

  // Validate length
  if (errorCtx.trim().length < 20) {
    alert("Error content is too short to explain. Please check the logs manually.");
    return;
  }

  // Render side panel
  const rightContainer = document.querySelector('.ide-react-panel[data-panel-id="panel-pdf"]');
  if (!rightContainer) return;

  document.getElementById('copilot-side-panel')?.remove();
  const sidePanel = document.createElement('div');
  sidePanel.setAttribute('id', 'copilot-side-panel');

  // Reuse styles from FindSimilar or generic styles
  sidePanel.style.height = '100%';
  sidePanel.style.backgroundColor = 'var(--ol-panel-bg, #fff)';
  sidePanel.style.zIndex = '100';
  sidePanel.style.overflow = 'hidden';
  sidePanel.style.display = 'flex';
  sidePanel.style.flexDirection = 'column';

  rightContainer.appendChild(sidePanel);

  if (options) {
    // Dynamically import ExplainError to avoid circular deps if any (though static import is fine here)
    const { ExplainError } = await import('../components/ExplainError');

    render(h(ExplainError, {
      errorCtx,
      options,
      onClose: () => document.getElementById('copilot-side-panel')?.remove()
    }), sidePanel);
  }
}

// Handle "Find Similar" action from menu
function handleSearch() {
  if (!currentSelection) return;

  chrome.runtime.sendMessage({
    type: 'load-more',
    payload: { selection: currentSelection.content.selection }
  });
}

// Track if the current completion was triggered by the menu
// let isMenuTriggered = false; // logic removed

let lastCursorHead: number | null = null;

// Handle selection changes from main world (for tracking hasSelection state)
function onEditorSelect(
  event: CustomEvent<{
    content: TextContent;
    from: number;
    to: number;
    head: number;
  }>
) {
  currentSelection = event.detail;
  hasSelection = true;
  lastCursorHead = event.detail.head;
  renderBadge();
}

// Handle cursor update (clear selection state)
function onCursorUpdate(event: CustomEvent<{ hasSelection: boolean, head?: number }>) {
  if (!event.detail.hasSelection) {
    hasSelection = false;
    currentSelection = null;
    renderBadge();
  }

  // Check if cursor actually moved
  const newHead = event.detail.head;
  if (newHead !== undefined && lastCursorHead !== null && newHead === lastCursorHead) {
    return;
  }

  if (newHead !== undefined) {
    lastCursorHead = newHead;
  }

  // Don't abort if we just triggered a completion (avoid race condition)
  if (justTriggeredCompletion) {
    return;
  }

  // Abort any in-progress suggestions if cursor moved (but not improve operations)
  suggestionAbortController?.abort();
  // Don't abort improveAbortController or remove toolbar-editor - it has its own close button
}

async function onOptionsUpdate() {
  options = await getOptions();

  // Firefox-safe event dispatch
  const win = window as any;
  const detail = { options };

  if (win.wrappedJSObject) {
    // Firefox: store on wrappedJSObject and pass ID
    const eventId = `__copilot_event_${Date.now()}_${Math.random()}`;
    try {
      win.wrappedJSObject[eventId] = cloneInto(detail, win.wrappedJSObject);
    } catch (e) {
      win.wrappedJSObject[eventId] = detail;
    }
    window.dispatchEvent(
      new CustomEvent('copilot:options:update', { detail: eventId })
    );
  } else {
    // Chrome/Edge: direct detail
    window.dispatchEvent(
      new CustomEvent('copilot:options:update', { detail })
    );
  }

  renderBadge();
}

// Event listeners
window.addEventListener('copilot:continue:response', onContinueRequest as any as EventListener);
window.addEventListener('copilot:editor:select', onEditorSelect as any as EventListener);
window.addEventListener('copilot:cursor:update', onCursorUpdate as any as EventListener);
chrome.storage.onChanged.addListener(onOptionsUpdate);
onOptionsUpdate();

// Initialize Status Badge - append to editor container, not document.body
function initBadge(retries: number) {
  if (retries <= 0) return;

  // Try to find the CodeMirror editor container
  const editorContainer = document.querySelector('.cm-editor') ||
    document.querySelector('.editor-container') ||
    document.querySelector('[class*="editor"]');

  if (!editorContainer) {
    setTimeout(() => initBadge(retries - 1), 500);
    return;
  }

  // Ensure the container has relative positioning for our absolute badge
  (editorContainer as HTMLElement).style.position = 'relative';

  const badgeContainer = document.createElement('div');
  badgeContainer.id = 'copilot-badge-container';
  editorContainer.appendChild(badgeContainer);
  renderBadge();
}

initBadge(20);
