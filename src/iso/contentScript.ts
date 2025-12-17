'use strict';

import './contentScript.css';

import { Options, TextContent } from '../types';
import { Suggestion } from '../common/suggestion';
import { getOptions, postProcessToken } from '../utils/helper';
import { getSuggestion } from '../utils/suggestion';
import { StatusBadge } from '../components/StatusBadge';
import { ToolbarEditor } from '../components/ToolbarEditor';
import { render, h } from 'preact';

let options: Options | undefined = undefined;
let suggestionAbortController: AbortController | null = null;
let improveAbortController: AbortController | null = null;
let isLoading = false;
let hasSelection = false;
let currentSelection: { content: TextContent; from: number; to: number; head: number } | null = null;
let justTriggeredCompletion = false; // Flag to prevent immediate abort after triggering completion

// Default action for "Improve Writing"
const DEFAULT_ACTION = {
  name: 'Improve',
  prompt: 'Rewrite and improve the following LaTeX content. output ONLY valid LaTeX code. Do NOT use markdown code blocks or fences like ```latex.\n{{selection}}',
  icon: 'pencil',
  onClick: 'show_editor'
};

// Re-render the badge when state changes
function renderBadge() {
  const badgeContainer = document.getElementById('copilot-badge-container');
  if (badgeContainer) {
    render(
      h(StatusBadge, {
        onComplete: handleComplete,
        onImprove: () => handleAction(DEFAULT_ACTION as any),
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

// Default action for "Complete at Cursor"
const COMPLETE_ACTION = {
  name: 'Complete at Cursor',
  prompt: '', // Will be filled from options
  icon: 'sparkles',
  onClick: 'insert'
};

// Handle "Complete at Cursor" action from menu
function handleComplete() {
  if (!options || options.suggestionDisabled) return;

  // Use the configured prompt
  const action = {
    ...COMPLETE_ACTION,
    prompt: options.suggestionPrompt || ''
  };

  // We need to trigger the completion flow which gathers context
  // Wait, handleAction needs DATA (currentSelection). 
  // If we just clicked menu, we might have currentSelection (onEditorSelect). 
  // `onEditorSelect` updates `currentSelection`.
  // If no selection, `currentSelection` might be null IF `onCursorUpdate` cleared it.
  // But for completion we often have NO selection (just cursor).
  // `checkSelectionState` in main sends `copilot:cursor:update` with `hasSelection: false` if range is 0.
  // `onCursorUpdate` sets `currentSelection = null`.
  // So `handleAction` FAILS if `currentSelection` is null.

  // FIX: We must request context from main world first, THEN open Editor.
  // So `handleComplete` must dispatch `copilot:menu:complete` (or similar request).
  // Then `onCompleteRequest` handles it.
  // `handleComplete` logic behaves same as before: triggers main world.

  console.log('[Copilot Debug] handleComplete triggered');

  // Focus editor
  const editor = document.querySelector('.cm-content') as HTMLElement;
  if (editor) editor.focus();

  // Dispatch request to main world to get context (before/after)
  window.dispatchEvent(new CustomEvent('copilot:menu:complete'));
}

// Handle completion request from main world (response with context)
async function onCompleteRequest(
  event: CustomEvent<{
    content: TextContent;
    head: number;
  }>
) {
  // Abort only if we were doing something else? 
  // Actually, we want to START the editor now.

  if (options == undefined || options.suggestionDisabled) return;

  // Construct fake selection object for ToolbarEditor
  // ToolbarEditor expects { content: TextContent, from, to, head }
  const data = {
    content: event.detail.content,
    from: event.detail.head, // Empty selection at cursor
    to: event.detail.head,
    head: event.detail.head
  };

  // Use the configured prompt
  const action = {
    ...COMPLETE_ACTION,
    prompt: options.suggestionPrompt || ''
  };

  // Open the Toolbar Editor
  // We reuse handleAction logic but we need to pass DATA explicitly because currentSelection might be null
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
    console.log('[Copilot Debug] Skipping abort - cursor position unchanged');
    return;
  }

  if (newHead !== undefined) {
    lastCursorHead = newHead;
  }

  // Don't abort if we just triggered a completion (avoid race condition)
  if (justTriggeredCompletion) {
    console.log('[Copilot Debug] Skipping abort - completion was just triggered');
    return;
  }

  // If this is a menu-triggered completion (buffer mode), do not abort even if cursor moves
  if (isMenuTriggered) {
    console.log('[Copilot Debug] Skipping abort - menu triggered completion in progress');
    return;
  }

  // Abort any in-progress suggestions if cursor moved (but not improve operations)
  suggestionAbortController?.abort();
  // Don't abort improveAbortController or remove toolbar-editor - it has its own close button
}

async function onOptionsUpdate() {
  options = await getOptions();
  window.dispatchEvent(
    new CustomEvent('copilot:options:update', { detail: { options } })
  );
  renderBadge();
}

// Event listeners
window.addEventListener('copilot:complete:response', onCompleteRequest as any as EventListener);
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
