import * as Diff from 'diff';
import { getCmView } from './helpers';
import { Suggestion } from '../common/suggestion';

// Helper to safely extract event detail across Firefox isolated/main world boundary
function getEventDetail<T>(e: CustomEvent<any>): T {
  const detail = e.detail;

  // Firefox: detail is a string ID pointing to data on window.wrappedJSObject
  if (typeof detail === 'string' && detail.startsWith('__copilot_event_')) {
    const win = window as any;
    if (win[detail]) {
      const data = win[detail];
      // Clean up temporary storage
      delete win[detail];
      return data as T;
    }
  }

  // Chrome/Edge: direct access
  return detail as T;
}

export function onAcceptSuggestion() {
  const suggestion = Suggestion.getCurrent();
  if (suggestion?.status !== 'completed') {
    suggestion?.remove();
    return;
  }

  const view = getCmView();
  const changes = {
    from: suggestion.pos,
    to: view.state.selection.main.head,
    insert: suggestion.text
  };
  view.dispatch({ changes });
  suggestion.remove();
}

export function onAcceptPartialSuggestion() {
  const suggestion = Suggestion.getCurrent();
  if (suggestion?.status !== 'completed') return;

  const pos = suggestion.pos;
  const text = suggestion.text;

  let acceptedLength = text.length;
  let hasContent = false;

  const isSpace = (c: string) => c == ' ' || c == '\n';

  for (let i = 0; i < text.length; i++) {
    const b = isSpace(text[i]);
    hasContent ||= !b;
    if (hasContent && b) { acceptedLength = i; break; }
  }
  const accepted = text.substring(0, acceptedLength);
  const changes = { from: pos, to: pos, insert: accepted };
  const view = getCmView();
  suggestion.toPartialAccepted(acceptedLength);
  view.dispatch({ changes: changes, selection: { anchor: pos + acceptedLength } });
}

export function onReplaceContent(
  e: CustomEvent<{ content: string; from: number; to: number }>
) {
  const detail = getEventDetail<{ content: string; from: number; to: number }>(e);
  var view = getCmView();
  const state = view.state;
  if (
    state.selection.main.from == detail.from &&
    state.selection.main.to == detail.to
  ) {
    const originalContent = state.sliceDoc(
      state.selection.main.from,
      state.selection.main.to
    )
    let changes = [];
    let diffs = Diff.diffChars(originalContent, detail.content);

    if (diffs.length >= 500) {
      diffs = Diff.diffWordsWithSpace(originalContent, detail.content);
    }

    if (diffs.length >= 500) {
      changes.push({
        from: detail.from,
        to: detail.to,
        insert: detail.content,
      });
    } else {
      let index = 0;
      for (const diff of diffs) {
        if (diff.added) {
          changes.push({
            from: detail.from + index,
            to: detail.from + index,
            insert: diff.value,
          });
        } else if (diff.removed) {
          changes.push({
            from: detail.from + index,
            to: detail.from + index + diff.value.length,
          });
          index += diff.value.length;
        } else {
          index += diff.value.length;
        }
      }
    }

    const selection = { anchor: detail.from + detail.content.length };
    view.dispatch({ changes, selection });
  }
}

export function onInsertContent(
  e: CustomEvent<{ content: string; pos?: number }>
) {
  const detail = getEventDetail<{ content: string; pos?: number }>(e);
  const view = getCmView();
  const state = view.state;
  const insertPos = detail.pos !== undefined ? detail.pos : state.selection.main.head;

  const changes = {
    from: insertPos,
    to: insertPos,
    insert: detail.content
  };

  // Dispatch change and move cursor to end of insertion
  view.dispatch({
    changes,
    selection: { anchor: insertPos + detail.content.length }
  });
}
