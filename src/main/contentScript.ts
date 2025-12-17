'use strict';

import { getContentBeforeCursor, getCmView, updateSuggestionOnCursorUpdate, getContentAfterCursor } from './helpers';
import { onAcceptPartialSuggestion, onAcceptSuggestion, onReplaceContent, onInsertContent } from './eventHandlers';
import { MAX_LENGTH_AFTER_CURSOR, MAX_LENGTH_BEFORE_CURSOR, MAX_LENGTH_SELECTION } from '../constants';

// Store the configured keyboard shortcut
let completionShortcut: { key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean } | null = null;

// Parse shortcut string like "Ctrl+Space" or "Alt+C"
function parseShortcut(shortcut: string | undefined) {
  if (!shortcut || shortcut.trim() === '') {
    completionShortcut = null;
    return;
  }

  const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
  const parsed = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') parsed.ctrl = true;
    else if (part === 'alt') parsed.alt = true;
    else if (part === 'shift') parsed.shift = true;
    else if (part === 'cmd' || part === 'meta' || part === 'command') parsed.meta = true;
    else if (part === 'space') parsed.key = ' ';
    else parsed.key = part;
  }

  if (parsed.key) {
    completionShortcut = parsed;
  } else {
    completionShortcut = null;
  }
}

// Listen for options updates
window.addEventListener('copilot:options:update', ((event: CustomEvent<{ options: { completionShortcut?: string } }>) => {
  parseShortcut(event.detail.options.completionShortcut);
}) as EventListener);

// Handle keyboard shortcuts for accepting suggestions AND triggering completion
function onKeyDown(event: KeyboardEvent) {
  // Handle Tab for accepting suggestions
  if (event.key == 'Tab') {
    onAcceptSuggestion();
    return;
  }

  // Handle Ctrl+Arrow for partial accept
  if ((event.metaKey || event.ctrlKey) && event.key == 'ArrowRight') {
    onAcceptPartialSuggestion();
    return;
  }

  // Handle configurable shortcut for triggering completion
  if (completionShortcut) {
    const keyMatches = event.key.toLowerCase() === completionShortcut.key ||
      (completionShortcut.key === ' ' && event.key === ' ');
    const modifiersMatch =
      event.ctrlKey === completionShortcut.ctrl &&
      event.altKey === completionShortcut.alt &&
      event.shiftKey === completionShortcut.shift &&
      event.metaKey === completionShortcut.meta;

    if (keyMatches && modifiersMatch) {
      event.preventDefault();
      event.stopPropagation();
      triggerCompletion();
    }
  }
}

// Trigger completion - gather cursor data and send to ISO world
function triggerCompletion() {
  const view = getCmView();
  const state = view.state;
  const head = state.selection.main.head;

  window.dispatchEvent(
    new CustomEvent('copilot:complete:response', {
      detail: {
        content: {
          selection: '',
          before: getContentBeforeCursor(state, head, MAX_LENGTH_BEFORE_CURSOR),
          after: getContentAfterCursor(state, head, MAX_LENGTH_AFTER_CURSOR),
        },
        head,
      },
    })
  );
}

// Handle "Complete at Cursor" request from menu (ISO world asks main world for cursor data)
function onMenuComplete() {
  triggerCompletion();
}

// Track selection changes and notify ISO world
function checkSelectionState() {
  const view = getCmView();
  const state = view.state;
  const from = state.selection.main.from;
  const to = state.selection.main.to;
  const head = state.selection.main.head;

  if (from != to) {
    // Has selection - notify ISO world
    if (to - from >= MAX_LENGTH_SELECTION) return;
    window.dispatchEvent(
      new CustomEvent('copilot:editor:select', {
        detail: {
          content: {
            selection: state.sliceDoc(from, to),
            before: getContentBeforeCursor(state, from, MAX_LENGTH_BEFORE_CURSOR),
            after: getContentAfterCursor(state, to, MAX_LENGTH_AFTER_CURSOR),
          },
          from,
          to,
          head,
        },
      })
    );
  } else {
    // No selection
    window.dispatchEvent(
      new CustomEvent('copilot:cursor:update', {
        detail: { hasSelection: false, head: head },
      })
    );
  }
}

// Debounce selection checking to avoid too many events
let selectionCheckTimeout: NodeJS.Timeout | null = null;
function debouncedSelectionCheck() {
  document.getElementById('copilot-toolbar')?.remove();
  // Don't auto-remove copilot-toolbar-editor - it has its own close button
  updateSuggestionOnCursorUpdate();

  if (selectionCheckTimeout) clearTimeout(selectionCheckTimeout);
  selectionCheckTimeout = setTimeout(() => {
    checkSelectionState();
    selectionCheckTimeout = null;
  }, 300);
}

// Event listeners
window.addEventListener('copilot:editor:replace', onReplaceContent as EventListener);
window.addEventListener('copilot:menu:complete', onMenuComplete);
window.addEventListener('copilot:suggestion:accept', onAcceptSuggestion as EventListener);
window.addEventListener('copilot:editor:insert', onInsertContent as EventListener);

// Setup keydown listener for Tab/Arrow shortcuts and configurable completion shortcut
const setupKeydownListener = (n: number) => {
  if (n <= 0) return true;
  const editor = document.querySelector('.cm-content');
  if (!editor) {
    setTimeout(() => setupKeydownListener(n - 1), 500);
    return false;
  }
  editor.addEventListener('keydown', onKeyDown as EventListener);
  return true;
};

setupKeydownListener(10);

// Hook into CodeMirror dispatch to track selection changes (not for auto-triggering)
const hookCmDispatch = (n: number) => {
  if (n <= 0) return;
  const editor = document.querySelector('.cm-content') as any;
  if (!editor || !editor.cmView || !editor.cmView.view) {
    setTimeout(() => hookCmDispatch(n - 1), 500);
    return;
  }
  const view = editor.cmView.view;
  const originalDispatch = view.dispatch;
  view.dispatch = (...args: any[]) => {
    originalDispatch.apply(view, args);
    // Only check selection state, don't auto-trigger suggestions
    debouncedSelectionCheck();
  };
  console.log('Overleaf Copilot: Hooked into CodeMirror dispatch');
};

hookCmDispatch(20);
