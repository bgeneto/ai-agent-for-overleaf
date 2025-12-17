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


// Handle OpenAI streaming via long-lived connection
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'openai-stream') return;

  port.onMessage.addListener(async function (msg) {
    if (msg.type === 'start-stream') {
      const { apiKey, apiBaseUrl, model, max_tokens, messages } = msg.payload;

      try {
        const baseUrl = apiBaseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: max_tokens,
            stream: true
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        if (!response.body) {
          throw new Error('No response body received');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                const content = data.choices?.[0]?.delta?.content || '';
                if (content) {
                  port.postMessage({ kind: 'token', content });
                }
              } catch (e) {
                console.error("Error parsing stream chunk", e);
              }
            }
          }
        }

        // Signal done
        port.postMessage({ kind: 'done' });
        port.disconnect();

      } catch (err) {
        port.postMessage({ kind: 'error', content: String(err) });
        port.disconnect();
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