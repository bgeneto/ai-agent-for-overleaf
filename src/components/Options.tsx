import { render, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks'
import { LOCAL_STORAGE_KEY_OPTIONS, MODELS } from '../constants';
import { Options } from '../types';
import { getOptions, encryptApiKey } from '../utils/helper';
import { IconSelect } from './IconSelect';
import { Key, Globe, Zap, Palette, Save, X, RefreshCw, Plus, Trash2, Check, AlertCircle } from 'lucide-preact';
import './styles/Options.css';

const OptionsForm = () => {
  type MessageType = 'success' | 'error' | 'warning' | 'info';
  type Feedback = { text: string; type: MessageType };

  const [state, setState] = useState<Options>({});
  const [message, setMessage] = useState<Feedback | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Feedback | null>(null);
  const [addDomainStatus, setAddDomainStatus] = useState<Feedback | null>(null);
  const [newDomain, setNewDomain] = useState<string>('');

  useEffect(() => {
    getOptions().then((options) => {
      onOptionsChange(options);
    });
  }, []);

  const onSubmit = async (e: Event) => {
    e.preventDefault();

    // Auto-add any pending domain before saving
    if (newDomain.trim()) {
      await addDomain();
    }

    const optionsToSave = { ...state };
    if (optionsToSave.apiKey && !optionsToSave.apiKey.startsWith('sk-') && !optionsToSave.apiKey.startsWith('ey')) {
      optionsToSave.apiKey = encryptApiKey(optionsToSave.apiKey);
    } else if (optionsToSave.apiKey) {
      optionsToSave.apiKey = encryptApiKey(optionsToSave.apiKey);
    }

    // Validate Toolbar Actions
    if (optionsToSave.toolbarActions) {
      for (let i = 0; i < optionsToSave.toolbarActions.length; i++) {
        const action = optionsToSave.toolbarActions[i];
        if (!action.name || !action.name.trim()) {
          setMessage({ text: `Action #${i + 1} must have a name.`, type: 'error' });
          return;
        }
        if (!action.prompt || !action.prompt.trim()) {
          setMessage({ text: `Action #${i + 1} must have a prompt.`, type: 'error' });
          return;
        }
      }
    }

    await chrome.storage.local.set({ [LOCAL_STORAGE_KEY_OPTIONS]: optionsToSave });
    setMessage({ text: 'Settings saved successfully!', type: 'success' });
  };

  const onAddAction = () => {
    const toolbarActions = state.toolbarActions ?? [];
    toolbarActions.push({ name: '', prompt: '', icon: '', onClick: 'show_editor' });
    onOptionsChange({ ...state, toolbarActions });
  };

  const onDeleteAction = (index: number) => {
    const toolbarActions = state.toolbarActions;
    if (!toolbarActions || index < 0) return;
    toolbarActions.splice(index, 1);
    onOptionsChange({ ...state, toolbarActions });
  };

  const onClose = () => {
    window.close();
  }

  const onOptionsChange = (options: Options) => {
    setMessage(null);
    setState(options);
  }

  const version = chrome.runtime.getManifest().version;

  const fetchModels = async () => {
    setMessage({ text: 'Fetching models...', type: 'info' });
    try {
      const baseUrl = state.apiBaseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';
      const apiKey = state.apiKey;

      if (!apiKey) {
        setMessage({ text: 'Please enter an API key first', type: 'warning' });
        return;
      }

      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      const allModels = data.data.map((m: any) => m.id).sort();

      const chatModels = allModels.filter((id: string) =>
        id.startsWith('gpt') || id.startsWith('o1') || !id.includes('embedding')
      );
      const embedModels = allModels.filter((id: string) =>
        id.includes('embedding')
      );

      const newState = { ...state, availableModels: chatModels, availableEmbeddingModels: embedModels };

      if (chatModels.includes(state.model)) {
        // keep current
      } else if (chatModels.length > 0) {
        newState.model = chatModels[0];
      }

      if (embedModels.includes(state.embeddingModel)) {
        // keep current
      } else if (embedModels.length > 0) {
        newState.embeddingModel = embedModels[0];
      }

      onOptionsChange(newState);
      setMessage({ text: `Fetched ${allModels.length} models`, type: 'success' });
    } catch (error) {
      if (error instanceof Error) {
        setMessage({ text: error.message, type: 'error' });
      } else {
        setMessage({ text: 'An unknown error occurred', type: 'error' });
      }
    }
  };

  const testConnection = async () => {
    setMessage({ text: 'Testing connection...', type: 'info' });
    setConnectionStatus({ text: 'Testing...', type: 'info' });
    try {
      const baseUrl = state.apiBaseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';
      const apiKey = state.apiKey;
      if (!apiKey) {
        setMessage({ text: 'Please enter an API key first', type: 'warning' });
        setConnectionStatus({ text: 'Missing API Key', type: 'warning' });
        return;
      }
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        setConnectionStatus({ text: 'Connected', type: 'success' });
        await fetchModels();
      } else {
        setMessage({ text: `Failed: ${response.status} ${response.statusText}`, type: 'error' });
        setConnectionStatus({ text: 'Failed', type: 'error' });
      }
    } catch (e) {
      if (e instanceof Error) {
        setMessage({ text: `Error: ${e.message}`, type: 'error' });
        setConnectionStatus({ text: 'Error', type: 'error' });
      } else {
        setMessage({ text: 'Connection failed.', type: 'error' });
        setConnectionStatus({ text: 'Failed', type: 'error' });
      }
    }
  };

  const addDomain = async () => {
    setAddDomainStatus({ text: 'Adding...', type: 'info' });
    let domain = newDomain.trim();
    if (!domain) {
      setAddDomainStatus(null);
      return;
    }

    domain = domain.replace(/\/$/, '');

    if (!domain.startsWith('http')) {
      domain = 'https://' + domain;
    }

    let origin: string;
    try {
      origin = new URL(domain).origin;
    } catch {
      setMessage({ text: 'Invalid domain URL', type: 'error' });
      return;
    }

    const granted = await (chrome as any).permissions.request({
      origins: [origin + '/*']
    });

    if (!granted) {
      setMessage({ text: 'Permission denied', type: 'error' });
      setAddDomainStatus({ text: 'Permission denied', type: 'error' });
      return;
    }

    try {
      const idSuffix = origin.replace(/[^a-zA-Z0-9]/g, '-');
      await (chrome as any).scripting.registerContentScripts([
        {
          id: `main-${idSuffix}`,
          js: ['contentMainScript.js'],
          matches: [origin + '/project/*'],
          world: 'MAIN',
          runAt: 'document_idle',
          persistAcrossSessions: true
        },
        {
          id: `iso-${idSuffix}`,
          js: ['contentIsoScript.js'],
          css: ['contentIsoScript.css'],
          matches: [origin + '/project/*'],
          runAt: 'document_idle',
          persistAcrossSessions: true
        }
      ]);

      const customDomains = [...(state.customDomains || []), origin];
      const uniqueDomains = Array.from(new Set(customDomains));

      onOptionsChange({ ...state, customDomains: uniqueDomains });
      setNewDomain('');
      setAddDomainStatus({ text: 'Added!', type: 'success' });
      setMessage({ text: `Added domain: ${origin}`, type: 'success' });
    } catch (e) {
      setAddDomainStatus({ text: 'Error', type: 'error' });
      if (e instanceof Error) {
        setMessage({ text: `Error: ${e.message}`, type: 'error' });
      } else {
        setMessage({ text: 'Unknown error registering script', type: 'error' });
      }
    }
  };

  const removeDomain = async (domain: string) => {
    try {
      const idSuffix = domain.replace(/[^a-zA-Z0-9]/g, '-');
      try {
        await (chrome as any).scripting.unregisterContentScripts({
          ids: [`main-${idSuffix}`, `iso-${idSuffix}`]
        });
      } catch (e) {
        // Silent failure
      }

      const customDomains = (state.customDomains || []).filter(d => d !== domain);
      onOptionsChange({ ...state, customDomains });
      setMessage({ text: `Removed domain: ${domain}`, type: 'success' });

      chrome.permissions.remove({
        origins: [domain + '/*']
      });

    } catch (e) {
      if (e instanceof Error) {
        setMessage({ text: `Error: ${e.message}`, type: 'error' });
      }
    }
  };

  const StatusBadge = ({ status }: { status: Feedback | null }) => {
    if (!status) return null;
    return (
      <span className={`status-badge ${status.type}`}>
        {status.type === 'success' && <Check size={14} />}
        {status.type === 'error' && <AlertCircle size={14} />}
        {status.text}
      </span>
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="options-container">
        {/* Header */}
        <header className="options-header">
          <div className="options-header-title">
            <div className="options-header-icon">
              <img src="icons/icon_48.png" alt="AI Agent" width={48} height={48} />
            </div>
            <div>
              <h1>AI Agent for Overleaf</h1>
              <p className="options-subtitle">
                Need help? <a href="https://github.com/bgeneto/ai-agent-for-overleaf/issues" target="_blank">Report an issue</a>
              </p>
            </div>
          </div>
          <span className="options-version">v{version}</span>
        </header>

        {/* API Configuration Card */}
        <div className="options-card">
          <div className="options-card-header">
            <div className="options-card-icon api">
              <Key size={18} />
            </div>
            <div className="options-card-title">
              <h2>API Configuration</h2>
              <p>Configure your OpenAI-compatible API connection</p>
            </div>
          </div>
          <div className="options-card-content">
            <div className="form-group">
              <div className="form-row">
                <label className="form-label">API Key</label>
                <div className="form-control">
                  <input
                    type="password"
                    required
                    value={state.apiKey || ''}
                    placeholder="sk-..."
                    onInput={(e: any) => onOptionsChange({ ...state, apiKey: e.currentTarget.value })}
                  />
                  <span className="form-hint">Required for all AI features</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="form-row">
                <label className="form-label">Base URL</label>
                <div className="form-control">
                  <input
                    type="text"
                    value={state.apiBaseUrl || ''}
                    placeholder="https://api.openai.com/v1"
                    onInput={(e: any) => onOptionsChange({ ...state, apiBaseUrl: e.currentTarget.value })}
                  />
                  <span className="form-hint">Optional: Use for custom endpoints or local proxies</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="form-row inline">
                <label className="form-label"></label>
                <div className="form-control">
                  <div className="form-control-row">
                    <button type="button" className="btn btn-secondary" onClick={testConnection}>
                      <RefreshCw size={16} />
                      Test Connection
                    </button>
                    <StatusBadge status={connectionStatus} />
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="form-row">
                <label className="form-label">Chat Model</label>
                <div className="form-control">
                  <div className="form-control-row">
                    <select
                      value={state.model}
                      onChange={(e: any) => onOptionsChange({ ...state, model: e.currentTarget.value })}
                      style={{ maxWidth: '280px' }}
                    >
                      {(state.availableModels && state.availableModels.length > 0 ? state.availableModels : MODELS).map((model) => (
                        <option value={model} selected={model === state.model}>{model}</option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-secondary btn-icon" onClick={fetchModels} title="Refresh models">
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="form-row">
                <label className="form-label">Embedding Model</label>
                <div className="form-control">
                  <select
                    value={state.embeddingModel}
                    onChange={(e: any) => onOptionsChange({ ...state, embeddingModel: e.currentTarget.value })}
                    style={{ maxWidth: '280px' }}
                  >
                    <option value="" disabled selected={!state.embeddingModel}>Select an embedding model</option>
                    {(state.availableEmbeddingModels || ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"]).map((model) => (
                      <option value={model} selected={model === state.embeddingModel}>{model}</option>
                    ))}
                  </select>
                  <span className="form-hint">Used for "Find Similar Papers" feature</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Domains Card */}
        <div className="options-card">
          <div className="options-card-header">
            <div className="options-card-icon domains">
              <Globe size={18} />
            </div>
            <div className="options-card-title">
              <h2>Custom Domains</h2>
              <p>Add self-hosted Overleaf instances</p>
            </div>
          </div>
          <div className="options-card-content">
            <div className="form-group">
              <div className="form-row inline">
                <label className="form-label">Add Domain</label>
                <div className="form-control">
                  <div className="form-control-row">
                    <input
                      type="text"
                      placeholder="https://tex.example.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          addDomain();
                        }
                      }}
                      onBlur={() => {
                        // Auto-add domain when user clicks away (if not empty)
                        if (newDomain.trim()) {
                          addDomain();
                        }
                      }}
                      style={{ maxWidth: '300px' }}
                    />
                    <button className="btn btn-add" type="button" onClick={addDomain}>
                      <Plus size={16} />
                      Add
                    </button>
                    <StatusBadge status={addDomainStatus} />
                  </div>
                </div>
              </div>
            </div>

            {state.customDomains && state.customDomains.length > 0 && (
              <div className="domain-list">
                {state.customDomains.map(domain => (
                  <div className="domain-item" key={domain}>
                    <span className="domain-item-url">{domain}</span>
                    <button className="btn btn-danger btn-icon" type="button" onClick={() => removeDomain(domain)} title="Remove domain">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Suggestions Card */}
        <div className="options-card">
          <div className="options-card-header">
            <div className="options-card-icon suggestion">
              <Zap size={18} />
            </div>
            <div className="options-card-title">
              <h2>AI Suggestions</h2>
              <p>Configure auto-completion behavior</p>
            </div>
          </div>
          <div className="options-card-content">
            <div className="form-group">
              <div className="form-row">
                <label className="form-label">Keyboard Shortcut</label>
                <div className="form-control">
                  <input
                    type="text"
                    placeholder="Ctrl+Shift+C"
                    value={state.completionShortcut || ''}
                    style={{ maxWidth: '200px' }}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      if (e.key === 'Backspace' || e.key === 'Delete') {
                        onOptionsChange({ ...state, completionShortcut: '' });
                        return;
                      }

                      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

                      const parts = [];
                      if (e.ctrlKey) parts.push('Ctrl');
                      if (e.metaKey) parts.push('Meta');
                      if (e.altKey) parts.push('Alt');
                      if (e.shiftKey) parts.push('Shift');

                      let key = e.key;
                      if (key === ' ') key = 'Space';
                      if (key.length === 1) key = key.toUpperCase();

                      parts.push(key);
                      const shortcut = parts.join('+');
                      onOptionsChange({ ...state, completionShortcut: shortcut });
                    }}
                  />
                  <span className="form-hint">Click and press keys to set. Backspace to clear.</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="form-row">
                <label className="form-label">Max Output Tokens</label>
                <div className="form-control">
                  <input
                    type="number"
                    placeholder="1024"
                    value={state.suggestionMaxOutputToken}
                    onChange={(e) => onOptionsChange({ ...state, suggestionMaxOutputToken: parseInt(e.currentTarget.value) })}
                  />
                  <span className="form-hint">Maximum tokens per suggestion (default: 1024)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar Actions Card */}
        <div className="options-card">
          <div className="options-card-header">
            <div className="options-card-icon toolbar">
              <Palette size={18} />
            </div>
            <div className="options-card-title">
              <h2>Custom Toolbar Actions</h2>
              <p>Add custom AI actions to the toolbar menu</p>
            </div>
          </div>
          <div className="options-card-content">
            {state.toolbarActions?.map((action, index) => (
              <div className="action-card" key={index}>
                <div className="action-card-header">
                  <span className="action-card-number">Action #{index + 1}</span>
                  <button className="btn btn-danger btn-icon" type="button" onClick={() => onDeleteAction(index)} title="Delete action">
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="form-group">
                  <div className="form-row">
                    <label className="form-label">Name</label>
                    <div className="form-control">
                      <input
                        type="text"
                        placeholder="Rewrite"
                        value={action.name}
                        onChange={(e) => {
                          const toolbarActions = state.toolbarActions;
                          if (!toolbarActions) return;
                          toolbarActions[index].name = e.currentTarget.value;
                          onOptionsChange({ ...state, toolbarActions });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-row inline">
                    <label className="form-label">Icon</label>
                    <div className="form-control">
                      <div className="icon-select-wrapper">
                        <IconSelect selected={action.icon} onChange={(value) => {
                          const toolbarActions = state.toolbarActions;
                          if (!toolbarActions) return;
                          toolbarActions[index].icon = value;
                          onOptionsChange({ ...state, toolbarActions });
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-row">
                    <label className="form-label">Prompt</label>
                    <div className="form-control">
                      <textarea
                        placeholder="Rewrite and improve the following content:&#10;{{selection}}&#10;"
                        value={action.prompt}
                        onChange={(e) => {
                          const toolbarActions = state.toolbarActions;
                          if (!toolbarActions) return;
                          toolbarActions[index].prompt = e.currentTarget.value;
                          onOptionsChange({ ...state, toolbarActions });
                        }}
                      />
                      <div className="variables-info">
                        <strong>Available variables:</strong><br />
                        <code>{'{{selection}}'}</code> Selected text &nbsp;|&nbsp;
                        <code>{'{{before}}'}</code> Text before cursor &nbsp;|&nbsp;
                        <code>{'{{after}}'}</code> Text after cursor
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button className="add-action-btn" type="button" onClick={onAddAction}>
              <Plus size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
              Add New Custom Action
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <footer className="options-footer">
        <div className="options-footer-content">
          <button type="submit" className="btn btn-primary">
            <Save size={16} />
            Save Changes
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            <X size={16} />
            Close
          </button>
          {!!message && <StatusBadge status={message} />}
        </div>
      </footer>
    </form>
  );
}

const App = () => {
  return <OptionsForm />;
};

render(<App />, document.body);