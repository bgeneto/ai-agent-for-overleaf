'use strict';



chrome.runtime.onMessage.addListener(function (request) {
  if (request.type === 'load-more') {
    chrome.tabs.create({
      url:
        chrome.runtime.getURL('similar.html') +
        '?selection=' +
        encodeURIComponent(request.payload.selection),
    });
  } else if (request.type === 'open-options') {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  }
});


function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function processSseLine(line: string, onToken: (content: string) => boolean) {
  const trimmed = line.trim();

  if (trimmed === '' || !trimmed.startsWith('data:')) {
    return true;
  }

  const payload = trimmed.slice(5).trimStart();

  if (payload === '[DONE]') {
    return false;
  }

  try {
    const data = JSON.parse(payload);
    const content = data.choices?.[0]?.delta?.content || '';

    if (content) {
      return onToken(content);
    }
  } catch (error) {
    console.error('Error parsing stream chunk', error);
  }

  return true;
}


// Handle OpenAI streaming via long-lived connection
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'openai-stream') return;

  let abortController: AbortController | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let isPortDisconnected = false;

  const stopActiveRequest = () => {
    abortController?.abort();
    abortController = null;

    const reader = activeReader;
    activeReader = null;

    if (reader) {
      void reader.cancel().catch(() => undefined);
    }
  };

  const disconnectPort = () => {
    if (isPortDisconnected) {
      return;
    }

    isPortDisconnected = true;

    try {
      port.disconnect();
    } catch (error) {
      // Port is already disconnected.
    }
  };

  const postMessageSafe = (message: { kind: 'token' | 'done' | 'error'; content?: string }) => {
    if (isPortDisconnected) {
      return false;
    }

    try {
      port.postMessage(message);
      return true;
    } catch (error) {
      isPortDisconnected = true;
      stopActiveRequest();
      return false;
    }
  };

  port.onDisconnect.addListener(() => {
    isPortDisconnected = true;
    stopActiveRequest();
  });

  port.onMessage.addListener(async function (msg) {
    if (msg.type === 'start-stream' && !isPortDisconnected) {
      const { apiKey, apiBaseUrl, model, max_tokens, messages, thinking_token_budget } = msg.payload;
      stopActiveRequest();
      const requestController = new AbortController();
      abortController = requestController;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const baseUrl = apiBaseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';

        const requestBody: Record<string, unknown> = {
          model: model,
          messages: messages,
          max_tokens: max_tokens,
          stream: true,
        };
        if (thinking_token_budget !== undefined) {
          requestBody.thinking_token_budget = thinking_token_budget;
          requestBody.extra_body = { thinking_token_budget };
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal: requestController.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        if (!response.body) {
          throw new Error('No response body received');
        }

        reader = response.body.getReader();
        activeReader = reader;
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let shouldContinue = true;

        while (shouldContinue) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            shouldContinue = processSseLine(line, (content) => postMessageSafe({ kind: 'token', content }));

            if (!shouldContinue || requestController.signal.aborted || isPortDisconnected) {
              break;
            }
          }
        }

        if (!requestController.signal.aborted && !isPortDisconnected) {
          buffer += decoder.decode();

          if (buffer) {
            processSseLine(buffer, (content) => postMessageSafe({ kind: 'token', content }));
          }
        }

        if (!requestController.signal.aborted && !isPortDisconnected) {
          postMessageSafe({ kind: 'done' });
        }

      } catch (error) {
        if (!requestController.signal.aborted && !isPortDisconnected) {
          postMessageSafe({ kind: 'error', content: toErrorMessage(error) });
        }
      } finally {
        if (activeReader === reader) {
          activeReader = null;
        }

        if (abortController === requestController) {
          abortController = null;
        }

        if (reader) {
          try {
            await reader.cancel();
          } catch (error) {
            // Reader is already closed.
          }
        }

        disconnectPort();
      }
    }
  });
});



chrome.action.onClicked.addListener(() => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});