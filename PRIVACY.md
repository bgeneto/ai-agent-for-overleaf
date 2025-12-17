# Privacy Policy for AI Agent for Overleaf

**Last Updated:** December 17, 2025

This Privacy Policy explains how **AI Agent for Overleaf** ("we", "us", or "the extension") collects, uses, and protects your information.

## 1. No Data Collection by the Developer
We do not collect, store, or transmit any of your personal data, LaTeX content, or usage data to our own servers. The extension runs entirely locally on your browser.

## 2. Third-Party Data Transmission
To provide AI functionalities (such as improving writing, completing text, or explaining errors), the extension sends specific snippets of your LaTeX content to the AI provider you configure.

### 2.1. OpenAI (Default)
If you configure the extension with an OpenAI API Key:
- **Data Sent**: Selected text snippets and immediate context (text before/after cursor) are sent to OpenAI's API.
- **Purpose**: To generate text completions or improvements.
- **Retention**: OpenAI's data retention policies apply. For API users, OpenAI generally does not use data to train their models by default (subject to their terms).
- **Control**: You communicate directly with OpenAI using your own API Key.

### 2.2. Custom Endpoints & Third-Party Providers
If you configure a custom API Base URL (e.g., OpenRouter, Azure OpenAI, or a local Ollama instance):
- **Data Sent**: Data is sent directly to the URL you specify in the settings.
- **Control**: You have full control over where your data goes. We do not validate or monitor the security of custom endpoints involved.

## 3. Permissions Usage

*   **Host Permissions**: We request access to `overleaf.com` to integrate the assistant into the editor. For self-hosted instances, you must granting permission explicitly for that specific domain.
*   **Storage**: Used to save your settings (API Key, preferences) locally in your browser.
*   **Scripting**: Used to inject the sidebar and toolbar into the editor page.

## 4. Data Security
*   **API Keys**: Your API Key is stored locally in your browser (`chrome.storage.local`). It is encrypted using a unique key generated for your specific installation to prevent plain-text exposure. It is never sent to us.

## 5. Contact
If you have questions about this privacy policy, you can contact the developer via the GitHub repository issue tracker.
