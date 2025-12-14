'use strict';

import './contentScript.css';

import { Options, TextContent } from '../types';
import { Suggestion } from '../common/suggestion';
import { getOptions } from '../utils/helper';
import { StatusBadge } from '../components/StatusBadge';
import { ToolbarEditor } from '../components/ToolbarEditor';
import { render, h } from 'preact';

let options: Options | undefined = undefined;
let suggestionAbortController: AbortController | null = null;
let improveAbortController: AbortController | null = null;
let isLoading = false;
let hasSelection = false;
let currentSelection: { content: TextContent; from: number; to: number; head: number } | null = null;

// Re-render the badge when state changes
function renderBadge() {
  const badgeContainer = document.getElementById('copilot-badge-container');
  if (badgeContainer) {
    render(
      h(StatusBadge, {
        onComplete: handleComplete,
        onImprove: handleImprove,
        onSearch: handleSearch,
        hasSelection,
        isLoading
      }),
      badgeContainer
    );
  }
}

// Handle "Complete at Cursor" action from menu
function handleComplete() {
  if (!options || options.suggestionDisabled) return;
  if (isLoading) return;

  // Request the main world to gather cursor info and send back
  window.dispatchEvent(new CustomEvent('copilot:menu:complete'));
}

// Handle "Improve Writing" action from menu - directly show editor
function handleImprove() {
  if (!options || options.toolbarDisabled) return;
  if (!currentSelection) return;

  improveAbortController?.abort();
  improveAbortController = new AbortController();

  // Remove any existing toolbar UI
  document.getElementById('copilot-toolbar')?.remove();
  document.getElementById('copilot-toolbar-editor')?.remove();

  // Get the first toolbar action (the Rewrite action)
  const action = options.toolbarActions?.[0] || { name: 'Improve', prompt: 'Rewrite and improve the following LaTeX content. Output ONLY valid LaTeX code, no markdown:\n{{selection}}', icon: 'pencil' };

  // Create and show the ToolbarEditor directly
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
  render(h(ToolbarEditor, {
    action,
    data: currentSelection,
    options,
    signal: improveAbortController.signal
  }), toolbarEditor);
}

// Handle "Find Similar" action from menu
function handleSearch() {
  if (!currentSelection) return;

  chrome.runtime.sendMessage({
    type: 'load-more',
    payload: { selection: currentSelection.content.selection }
  });
}

// Handle completion request from main world (with cursor data)
async function onCompleteRequest(
  event: CustomEvent<{
    content: TextContent;
    head: number;
  }>
) {
  suggestionAbortController?.abort();

  if (options == undefined || options.suggestionDisabled) return;

  // Remove any existing suggestion
  const existing = Suggestion.getCurrent();
  if (existing) existing.remove();

  suggestionAbortController = new AbortController();
  isLoading = true;
  renderBadge();

  try {
    await Suggestion.create(event.detail.head)?.generate(
      event.detail.content,
      suggestionAbortController.signal,
      options
    );
  } finally {
    isLoading = false;
    renderBadge();
  }
}

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
  renderBadge();
}

// Handle cursor update (clear selection state)
function onCursorUpdate(event: CustomEvent<{ hasSelection: boolean }>) {
  if (!event.detail.hasSelection) {
    hasSelection = false;
    currentSelection = null;
    renderBadge();
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
