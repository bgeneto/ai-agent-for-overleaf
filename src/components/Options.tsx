import { render, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks'
import 'purecss/build/pure-min.css';
import { LOCAL_STORAGE_KEY_OPTIONS, MODELS } from '../constants';
import { Options } from '../types';
import { getOptions, encryptApiKey } from '../utils/helper';
import { IconSelect } from './IconSelect';

const OptionsForm = () => {
  type MessageType = 'success' | 'error' | 'warning' | 'info';
  type Feedback = { text: string; type: MessageType };

  const [state, setState] = useState<Options>({});
  const [message, setMessage] = useState<Feedback | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Feedback | null>(null);
  const [addDomainStatus, setAddDomainStatus] = useState<Feedback | null>(null);
  const [newDomain, setNewDomain] = useState<string>('');

  const getStyle = (type: MessageType) => {
    switch (type) {
      case 'success': return { color: '#006400', fontWeight: 'bold' };
      case 'error': return { color: 'red', fontWeight: 'bold' };
      case 'warning': return { color: 'orange', fontWeight: 'bold' };
      default: return {};
    }
  };

  useEffect(() => {
    getOptions().then((options) => {
      onOptionsChange(options);
    });
  }, []);

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    const optionsToSave = { ...state };
    if (optionsToSave.apiKey && !optionsToSave.apiKey.startsWith('sk-') && !optionsToSave.apiKey.startsWith('ey')) {
      // It might be already encrypted if we didn't decrypt successfuly?
      // No, getOptions decrypts it.
      // But wait, if user pasted a key, it starts with sk-.
      // If we encrypt it, it won't start with sk-.
      // So we should encrypt it.
      optionsToSave.apiKey = encryptApiKey(optionsToSave.apiKey);
    } else if (optionsToSave.apiKey) {
      // It implies it is already encrypted or legacy that we want to encrypt?
      // If it starts with sk- (legacy plaintext), we want to encrypt it.
      // If it is newly typed by user, it starts with sk-.
      // So basically always encrypt if it looks like a key.
      // Our simple "is it encrypted" check in helper was: try decrypt, if fail...
      // Actually helper says: if (options.apiKey.startsWith('sk-')) { // Legacy plaintext }
      // So if it starts with sk-, it is plaintext.
      optionsToSave.apiKey = encryptApiKey(optionsToSave.apiKey);
    }

    // Actually, simpler logic: Always encrypt whatever is in the field before saving, 
    // UNLESS it looks like it's already encrypted (which shouldn't happen if we decrypt on load).
    // But wait, if we save it, then `state` still has plaintext.
    // Next time we load `getOptions`, it decrypts.

    // What if the user enters a non-sk key (e.g. Azure key or other provider)?
    // The previous code supported `apiBaseUrl`.
    // The encryption is just obfuscation.
    // Let's just encrypt blindly. `encryptApiKey` returns a string.

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
    setMessage({ text: 'Options saved!', type: 'success' });
  };

  const onAddAction = () => {
    const toolbarActions = state.toolbarActions ?? [];
    toolbarActions.push({ name: '', prompt: '', icon: '', onClick: 'show_editor' });
    onOptionsChange({ ...state, toolbarActions });
  };

  const onDeleteAction = (index: number) => {
    const toolbarActions = state.toolbarActions;
    if (!toolbarActions || index <= 0) return;
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

      // If encrypted, we can't fetch. But state.apiKey should be decrypted by getOptions logic?
      // Wait, on load, getOptions decrypts it. So state.apiKey is plaintext. Correct.

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
        setConnectionStatus({ text: 'Success!', type: 'success' });
        // Auto-refresh models on successful connection
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

    // remove trailing slash
    domain = domain.replace(/\/$/, '');

    // Ensure protocol
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

    // Permission request
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
      // Deduplicate
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
      // unregisterContentScripts might fail if ids don't exist, but we should try
      try {
        await (chrome as any).scripting.unregisterContentScripts({
          ids: [`main-${idSuffix}`, `iso-${idSuffix}`]
        });
      } catch (e) {
        console.warn('Failed to unregister scripts', e);
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

  return (
    <Fragment>
      <form class="pure-form pure-form-aligned" onSubmit={onSubmit}>
        <fieldset>
          <legend><h1>Options</h1></legend>
          <div class="pure-u-3-4">
            <p>
              For any issues or feature requests, visit:
              <a target="_blank" href="https://github.com/bgeneto/overleaf-copilot/issues">https://github.com/bgeneto/overleaf-copilot/issues</a>.
            </p>
          </div>
          <div class="pure-control-group">
            <label for="field-api-key">OpenAI API Key</label>
            <input type="password" id="field-api-key" required
              value={state.apiKey || ''} placeholder="sk-..." class="pure-input-1-3"
              onInput={(e: any) => onOptionsChange({ ...state, apiKey: e.currentTarget.value })} />
            <span class="pure-form-message-inline">Required for all features.</span>
          </div>

          <div class="pure-control-group">
            <label for="field-api-base-url">API Base URL</label>
            <input type="text" id="field-api-base-url"
              value={state.apiBaseUrl || ''} placeholder="https://api.openai.com/v1" class="pure-input-1-3"
              onInput={(e: any) => onOptionsChange({ ...state, apiBaseUrl: e.currentTarget.value })} />
            <span class="pure-form-message-inline">Optional (for proxies/local).</span>
          </div>

          <div class="pure-control-group">
            <label></label>
            <button type="button" class="pure-button" onClick={testConnection}>Test Connection</button>
            {!!connectionStatus &&
              <span style={{ marginLeft: '10px', ...getStyle(connectionStatus.type) }}>
                {connectionStatus.text}
              </span>
            }
          </div>

          <div class="pure-control-group">
            <label for="field-model">Chat Model</label>
            <select style="padding-top: 0px; padding-bottom: 0px" id="field-model" class="pure-input-1-4"
              value={state.model}
              onChange={(e: any) => onOptionsChange({ ...state, model: e.currentTarget.value })}>
              {(state.availableModels && state.availableModels.length > 0 ? state.availableModels : MODELS).map((model) => (
                <option value={model} selected={model === state.model}>{model}</option>
              ))}
            </select>
            <button type="button" style="margin-left: 10px;" class="pure-button" onClick={fetchModels}>Refresh Models</button>
          </div>

          <div class="pure-control-group">
            <label for="field-embedding-model">Embedding Model</label>
            <select style="padding-top: 0px; padding-bottom: 0px" id="field-embedding-model" class="pure-input-1-4"
              value={state.embeddingModel}
              onChange={(e: any) => onOptionsChange({ ...state, embeddingModel: e.currentTarget.value })}>
              <option value="" disabled selected={!state.embeddingModel}>Select an embedding model</option>
              {(state.availableEmbeddingModels || ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"]).map((model) => (
                <option value={model} selected={model === state.embeddingModel}>{model}</option>
              ))}
            </select>
            <span class="pure-form-message-inline pure-u-1-3">For "Find Similar" feature.</span>
          </div>
          <h2>Custom Domains</h2>
          <div class="pure-u-3-4">
            <p>Add self-hosted Overleaf instances here. You will need to grant permission for the extension to run on these domains.</p>
          </div>
          <div class="pure-control-group">
            <label for="field-new-domain">Add Domain</label>
            <input class="pure-input-1-4" type="text" id="field-new-domain" placeholder="https://tex.example.com" value={newDomain}
              onChange={(e) => setNewDomain(e.currentTarget.value)} />
            <button class="pure-button" type="button" onClick={addDomain} style="margin-left: 5px">Add</button>
            {!!addDomainStatus &&
              <span style={{ marginLeft: '10px', ...getStyle(addDomainStatus.type) }}>
                {addDomainStatus.text}
              </span>
            }
          </div>
          {state.customDomains && state.customDomains.length > 0 &&
            <div class="pure-control-group">
              <label>Active Domains</label>
              <div class="pure-input-1-2" style="display: inline-block; vertical-align: top;">
                {state.customDomains.map(domain => (
                  <div key={domain} style="margin-bottom: 5px;">
                    <span style="display: inline-block; width: 200px;">{domain}</span>
                    <button class="pure-button" type="button" onClick={() => removeDomain(domain)}>-</button>
                  </div>
                ))}
              </div>
            </div>
          }

          <h2>Suggestion</h2>
          <div class="pure-u-3-4">
            <p>Configure AI-powered completions. Click the Copilot menu or use your keyboard shortcut to trigger completion at the cursor.
              Menu actions insert text automatically.</p>
          </div>
          <div class="pure-control-group">
            <label for="field-completion-shortcut">Keyboard Shortcut</label>
            <input class="pure-input-1-4" type="text" id="field-completion-shortcut"
              placeholder="Ctrl+Shift+C" value={state.completionShortcut || ''}
              onKeyDown={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // Allow clearing with Backspace/Delete
                if (e.key === 'Backspace' || e.key === 'Delete') {
                  onOptionsChange({ ...state, completionShortcut: '' });
                  return;
                }

                // Ignore modifier-only keydowns
                if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

                const parts = [];
                if (e.ctrlKey) parts.push('Ctrl');
                if (e.metaKey) parts.push('Meta');
                if (e.altKey) parts.push('Alt');
                if (e.shiftKey) parts.push('Shift');

                // Handle Space specially, otherwise use key name
                let key = e.key;
                if (key === ' ') key = 'Space';
                if (key.length === 1) key = key.toUpperCase();

                parts.push(key);

                const shortcut = parts.join('+');
                onOptionsChange({ ...state, completionShortcut: shortcut });
              }}
              readOnly={false}
            />
            <span class="pure-form-message-inline pure-u-1-3">Click and press keys to set shortcut. Backspace to clear.</span>
          </div>
          <div class="pure-control-group">
            <label for="field-suggestion-max-output-token">Max output token</label>
            <input class="pure-input-1-4" type="number" id="field-suggestion-max-output-token" placeholder="500" value={state.suggestionMaxOutputToken}
              onChange={(e) => onOptionsChange({ ...state, suggestionMaxOutputToken: parseInt(e.currentTarget.value) })} />
            <span class="pure-form-message-inline pure-u-1-3">Set the maximum number of tokens generated per suggestion. Default is 500.</span>
          </div>
          <div class="pure-control-group">
            <label for="field-suggestion-prompt">Prompt</label>
            <textarea style="height: 9em" class="pure-input-1-4" id="field-suggestion-prompt"
              placeholder="Continue the academic paper in LaTeX below, making sure to maintain semantic continuity. Do NOT use markdown.&#10;&#10;### Beginning of the paper ###&#10;{{before[-1000:]}}&#10;### End of the paper ###"
              value={state.suggestionPrompt}
              onChange={(e) => onOptionsChange({ ...state, suggestionPrompt: e.currentTarget.value })} />
            <span class="pure-form-message-inline pure-u-1-3">
              <span>
                Available variables are:<br /><br />
                <b>before</b>: Text before the cursor (max 5000 chars).<br />
                <b>after</b>: Text after the cursor (max 5000 chars).<br /><br />
                Add variables in the template using a Jinja like format, e.g. <code>&#123;&#123; before[-1000:] &#125;&#125;</code>.
              </span>
            </span>
          </div>
          <div class="pure-controls">
            <label for="field-suggestion-diabled" class="pure-checkbox">
              <input type="checkbox" id="field-suggestion-diabled" checked={state.suggestionDisabled}
                onChange={(e) => onOptionsChange({ ...state, suggestionDisabled: e.currentTarget.checked })} /> Disable
            </label>
            <span class="pure-form-message-inline pure-u-1-3">Disable the suggestion feature.</span>
          </div>

          <h2>Toolbar</h2>
          <div class="pure-u-3-4">
            <p>This section customizes how the toolbar works. You can add and customize multiple actions. It's triggered when you select a piece of text in the editor.</p>
          </div>
          {
            state.toolbarActions?.map((action, index) => (
              <Fragment>
                <div class="pure-control-group">
                  <label for={"field-action-name" + index}>#{index + 1} Action Name</label>
                  <input type="text" id={"field-action-name" + index} class="pure-input-1-4" placeholder="Rewrite" value={action.name}
                    onChange={(e) => {
                      const toolbarActions = state.toolbarActions;
                      if (!toolbarActions) return;
                      toolbarActions[index].name = e.currentTarget.value;
                      onOptionsChange({ ...state, toolbarActions });
                    }} />
                  {index > 0 && <button class="pure-button" style="margin-left: 5px" onClick={() => onDeleteAction(index)}>-</button>}
                </div>
                <div class="pure-control-group">
                  <label for={"field-action-icon" + index} style="line-height: 26px; vertical-align: top">Icon</label>
                  <div class="pure-input-1-4" style="display:inline-block">
                    <IconSelect selected={action.icon} onChange={(value) => {
                      const toolbarActions = state.toolbarActions;
                      if (!toolbarActions) return;
                      toolbarActions[index].icon = value;
                      onOptionsChange({ ...state, toolbarActions });
                    }} />
                  </div>
                  <span class="pure-form-message-inline pure-u-1-3">Choose an icon for this action in the toolbar.</span>
                </div>
                {/* On Click option removed as requested */}

                <div class="pure-control-group">
                  <label for={"field-suggestion-prompt" + index}>Prompt</label>
                  <textarea style="height: 9em" class="pure-input-1-4" id={"field-suggestion-prompt" + index}
                    placeholder="Rewrite and improve the following content:&#10;{{selection}}&#10;" value={action.prompt}
                    onChange={(e) => {
                      const toolbarActions = state.toolbarActions;
                      if (!toolbarActions) return;
                      toolbarActions[index].prompt = e.currentTarget.value;
                      onOptionsChange({ ...state, toolbarActions });
                    }} />
                  <span class="pure-form-message-inline pure-u-1-3">
                    <span>
                      Available variables are:<br /><br />
                      <b>selection</b>: Selected content.<br />
                      <b>before</b>: Text before the cursor (max 5000 chars).<br />
                      <b>after</b>: Text after the cursor (max 5000 chars).<br /><br />
                      Add variables in the template using a Jinja like format, e.g. <code>&#123;&#123; selection &#125;&#125;</code>.
                    </span>
                  </span>
                </div>
              </Fragment>))
          }
          <div class="pure-controls">
            <button class="pure-button" type="button" onClick={onAddAction}>+</button>
            <span class="pure-form-message-inline">Add a new custom action to the toolbar.</span>
          </div>
        </fieldset>

        <div class="pure-g">
          <div class="pure-u-1-2">
            <div class="pure-controls">
              <button type="submit" class="pure-button pure-button-primary">Save</button>
              <button class="pure-button" type="button" onClick={onClose} style="margin-left:10px">Close</button>
              {!!message &&
                <span class="pure-form-message-inline" style={{ marginLeft: '10px', ...getStyle(message.type) }}>
                  {message.text}
                </span>
              }
            </div>
          </div>
        </div>
      </form>
      <hr style="margin-top: 20px" />
      <p>Overleaf Copilot. Version: {version}</p>
    </Fragment >
  );
}

const App = () => {
  return (
    <div>
      <div class="pure-g">
        <div class="pure-u-1-4">
        </div>
        <div class="pure-u-1-2">
          <OptionsForm />
        </div>
      </div>
    </div>
  );
};

render(<App />, document.body);