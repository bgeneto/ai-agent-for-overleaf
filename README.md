# <img src="public/icons/icon_48.png" width="45" align="left"> AI Agent for Overleaf

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/pcmffklbilmgckfkbncpoffmicdpfkmm?label=Chrome)](https://chrome.google.com/webstore/detail/ai-agent-for-overleaf/pcmffklbilmgckfkbncpoffmicdpfkmm)
[![Edge Add-on](https://img.shields.io/badge/Edge-Add--on-blue)](https://microsoftedge.microsoft.com/addons/detail/ai-agent-for-overleaf/dgbgphmgphkibogcjhjhdmkjphejcead)
[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-orange)](https://addons.mozilla.org/firefox/addon/ai-agent-for-overleaf/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**AI-powered writing assistant for the [Overleaf](https://www.overleaf.com) LaTeX editor.**

Transform your academic writing with intelligent completion, text enhancement, error explanation, and research discovery—powered by OpenAI-compatible APIs.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Continue Writing** | AI continues your document from cursor position or selected text |
| **Improve Writing** | Enhance grammar, fluency, and academic style while preserving LaTeX |
| **Fix LaTeX** | Automatically fix LaTeX syntax and compilation errors |
| **Explain Error** | Get plain-language explanations of LaTeX compilation errors |
| **Custom Task** | Enter any instruction for the AI to execute on your content |
| **Custom Actions** | Create reusable toolbar actions with your own prompts |
| **Find Similar Papers** | Discover related research on arXiv |
| **Custom Domains** | Support for self-hosted Overleaf instances |

---

## 📦 Installation

### From Web Stores (Recommended)

| Browser | Link |
|---------|------|
| **Chrome** | [Chrome Web Store](https://chrome.google.com/webstore/detail/ai-agent-for-overleaf/pcmffklbilmgckfkbncpoffmicdpfkmm) |
| **Edge** | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ai-agent-for-overleaf/dgbgphmgphkibogcjhjhdmkjphejcead) |
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/ai-agent-for-overleaf/) *(128+)* |

### Manual Installation

```bash
git clone https://github.com/bgeneto/ai-agent-for-overleaf.git
cd ai-agent-for-overleaf
npm install
npm run build
```

Then load the `build/` folder as an unpacked extension in your browser.

---

## ⚙️ Setup

1. **Open Options** — Click the extension icon → Options
2. **Enter API Key** — From [OpenAI](https://platform.openai.com/api-keys) or any compatible provider
3. **Test Connection** — Verify your key and fetch available models
4. **Start Writing** — Open any Overleaf project

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| API Key | — | Your OpenAI-compatible API key (required) |
| Base URL | `https://api.openai.com/v1` | Custom endpoint for alternative providers |
| Chat Model | `gpt-4o-mini` | Model for text generation |
| Embedding Model | `text-embedding-3-small` | Model for "Find Similar Papers" |
| Max Tokens | `1024` | Maximum response length |
| Keyboard Shortcut | `Ctrl+Shift+C` | Trigger "Continue Writing" |

---

## 📖 Usage

### Status Badge Menu

A floating badge appears in Overleaf with quick access to all features:

| Action | Description |
|--------|-------------|
| **Continue Writing** | AI continues from cursor/selection |
| **Custom Task** | Enter any instruction |
| **Improve** | Enhance selected text |
| **Fix LaTeX** | Fix syntax errors in selection |
| **Find Similar** | Search arXiv for related papers |
| **Explain Error** | Explain the current compilation error |

### Floating Toolbar

Select text to reveal a floating toolbar with **Improve**, **Fix**, and **Search** actions.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Accept inline suggestion |
| `Ctrl+→` / `Cmd+→` | Accept one word |
| `Escape` | Dismiss suggestion |
| `Ctrl+Shift+C` | Continue Writing (configurable) |

---

## 🎨 Custom Toolbar Actions

Create reusable AI actions in Options → **Custom Toolbar Actions**:

1. **Name** — Display label (e.g., "Translate to Portuguese")
2. **Icon** — Visual indicator
3. **Prompt** — Your instruction with placeholders

### Available Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{{selection}}` | Selected text |
| `{{before}}` | Text before cursor |
| `{{after}}` | Text after cursor |

**Example:** `Translate to pt-BR: {{selection}}`

Custom actions automatically receive LaTeX-aware context for optimal results.

---

## 🔒 Privacy

| Aspect | Details |
|--------|---------|
| **Data Collection** | None |
| **API Communication** | Direct browser-to-API only |
| **Key Storage** | Local, AES-encrypted |
| **Analytics** | None |

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| No suggestions | Check API key, test connection, ensure 50+ chars before cursor |
| Wrong model | Click "Test Connection" to refresh model list |
| Firefox issues | Requires Firefox 128+ |
| Custom domain fails | Check permissions, ensure HTTPS |

---

## 🛠️ Development

```bash
npm install          # Install dependencies
npm run watch        # Development with hot reload
npm run build        # Production build
npm run repack       # Build + create browser packages
```

### Project Structure

```
src/
├── main/           # Main world (CodeMirror access)
├── iso/            # Isolated world (API calls, UI)
├── components/     # Preact UI components
├── utils/          # Helper functions
├── prompts.ts      # AI prompt templates
└── background.ts   # Service worker
```

---

## 🤝 Contributing

1. Fork → Branch → Make changes → Test → PR

**Areas for contribution:** Support for other editors, improved prompts, localization, tests.

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<p align="center">Made with ❤️ for the academic community</p>
