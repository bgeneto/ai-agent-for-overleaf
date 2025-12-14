# Overleaf Copilot - AI Agent Instructions

## Project Overview

Browser extension (Chrome/Edge) that adds AI-powered code completion and text improvement features to the Overleaf LaTeX editor. Built with TypeScript, Preact, and integrates with OpenAI API.

## Architecture

### Dual Content Script Pattern

The extension uses **two separate content scripts** injected into Overleaf pages (`https://www.overleaf.com/project/*`):

1. **Main World Script** (`src/main/contentScript.ts` → `contentMainScript.js`)
   - Runs in `MAIN` world to access Overleaf's CodeMirror editor instance
   - Directly manipulates `cmView.view` (CodeMirror 6) via `getCmView()` helper
   - Handles keyboard shortcuts: `Tab` (accept suggestion), `Cmd/Ctrl+ArrowRight` (partial accept)
   - Dispatches custom events (`cursor:editor:update`) to communicate with isolated world

2. **Isolated World Script** (`src/iso/contentScript.ts` → `contentIsoScript.js`)
   - Runs in isolated content script context for secure API calls
   - Listens to events from main world: `copilot:editor:update`, `copilot:editor:select`
   - Manages `Suggestion` class lifecycle and renders Preact UI components (Toolbar, ToolbarEditor)
   - Handles all OpenAI API communication via `openai` npm package (dangerouslyAllowBrowser: true)

### Cross-World Communication

Custom events bridge the two worlds:
- `cursor:editor:update` → triggers suggestion generation
- `copilot:editor:select` → shows toolbar on text selection
- `copilot:editor:replace` → applies AI-generated content to editor
- `copilot:cursor:update` → aborts ongoing requests

### Key Components

- **Suggestion System** (`src/common/suggestion.ts`): DOM-based suggestion overlay positioned relative to `.cm-cursor-primary`, manages states: `generating`, `completed`, `partial-accepted`, `error`
- **Toolbar** (`src/iso/toolbar.ts`): Context menu for selected text with customizable actions (`toolbarActions` in options)
- **ToolbarEditor**: Inline editing UI with diff view (uses `diff` package for char/word-level diffs)
- **FindSimilar**: arXiv paper search feature injected into PDF panel (`data-panel-id="panel-pdf"`)

## Development Workflow

### Build Commands

```bash
npm run watch   # Development build with source maps, auto-rebuild on changes
npm run build   # Production build (no source maps)
npm run pack    # Creates release/overleaf-copilot-v{version}.zip from build/
npm run repack  # build + pack combined
```

Webpack outputs to `build/` directory. Pack script (`pack.js`) reads version from `build/manifest.json`.

### Entry Points (webpack.config.js)

```javascript
contentMainScript: 'src/main/contentScript.ts'  // MAIN world
contentIsoScript: 'src/iso/contentScript.ts'    // Isolated world
background: 'src/background.ts'                  // Service worker
options: 'src/components/Options.tsx'            // Options page
similar: 'src/components/FindSimilarPage.tsx'    // Similar papers view
```

## Coding Conventions

### TypeScript Patterns

- **No React, use Preact**: All JSX uses Preact with `jsxImportSource: "preact"` in tsconfig
- **Strict imports**: Always use `'use strict';` at file top
- **Type safety**: Define interfaces in `src/types.ts` for cross-module contracts
- **Editor state access**: Never directly access DOM; use `getCmView()` to get CodeMirror view instance

### DOM Manipulation

- **Element IDs**: Prefix all injected elements with `copilot-` (e.g., `copilot-suggestion`, `copilot-toolbar`)
- **Cleanup pattern**: Always remove existing elements before creating new ones:
  ```typescript
  document.getElementById('copilot-toolbar')?.remove();
  const toolbar = document.createElement('div');
  toolbar.setAttribute('id', 'copilot-toolbar');
  ```
- **Positioning**: UI elements positioned absolutely relative to `.cm-cursor-primary` or `.cm-scroller` bounding rects

### API Integration

- **Fallback hosting**: If no `apiKey` in options, falls back to hosted endpoints (`HOSTED_COMPLETE_URL`, `HOSTED_IMPROVE_URL`)
- **Streaming responses**: Use async generators returning `StreamChunk` (`{ kind: "token" | "error", content: string }`)
- **Abort signals**: All API calls accept `AbortSignal` from `AbortController` for cancellation
- **Token limits**: Respect `MAX_LENGTH_BEFORE_CURSOR` (5000), `MAX_LENGTH_AFTER_CURSOR` (5000), `MAX_LENGTH_SELECTION` (20000) constants

### Event Handling

Debouncing pattern (500ms) on cursor updates:
```typescript
const debounce = (func) => {
  let timeout;
  return () => {
    window.dispatchEvent(new CustomEvent('copilot:cursor:update')); // Abort ongoing requests
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(func, 500);
  };
};
```

### Content Replacement Strategy

Uses `diff` package for granular updates:
- Attempts char-level diffs first (`Diff.diffChars`)
- Falls back to word-level (`Diff.diffWordsWithSpace`) if >500 changes
- Falls back to full replacement if still >500 changes
- Preserves cursor position by calculating anchor: `from + content.length`

## Extension Options Structure

Stored in `chrome.storage` with key `LOCAL_STORAGE_KEY_OPTIONS`:

```typescript
{
  apiKey?: string;           // OpenAI API key
  apiBaseUrl?: string;       // Custom base URL (for proxies)
  model?: string;            // Default: 'gpt-3.5-turbo'
  suggestionMaxOutputToken?: number;  // Default: 100
  suggestionPrompt?: string; // Custom system prompt
  suggestionDisabled?: boolean;
  toolbarActions?: ToolbarAction[];  // Custom toolbar buttons
  toolbarSearchDisabled?: boolean;
  toolbarDisabled?: boolean;
}
```

Access via `getOptions()` from `src/utils/helper.ts`.

## Testing & Debugging

- Load extension in Chrome via `chrome://extensions` → "Load unpacked" → select `build/` folder
- Check console in both page context (main world) and extension context (isolated world)
- Background script logs visible in extension's service worker inspector
- Use `--mode=development` for source maps

## Integration Points

- **CodeMirror 6**: Relies on Overleaf's CM6 instance accessible via `.cm-content` element
- **Overleaf UI**: Injects into `.ide-react-panel[data-panel-id="panel-pdf"]` for side panel features
- **Chrome APIs**: `chrome.storage`, `chrome.runtime.sendMessage`, `chrome.tabs.create`
