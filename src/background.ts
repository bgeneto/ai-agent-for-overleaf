'use strict';
import OpenAI from 'openai';


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
}
});


// Handle OpenAI streaming via long-lived connection
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'openai-stream') return;

  port.onMessage.addListener(async function (msg) {
    if (msg.type === 'start-stream') {
      const { apiKey, apiBaseUrl, model, max_tokens, messages } = msg.payload;

      try {
        // Manual fetch to avoid importing OpenAI library in background if possible?
        // No, background.ts can have dependencies. But earlier I saw it didn't have imports.
        // Let's check if I can import OpenAI in background.ts.
        // It's a Typescript file, compiled by Webpack. Yes.
        // But wait, if I add imports here, I need to ensure background.ts is processed correctly by webpack.
        // Looking at webpack.config.js (implied), background entry exists.

        // Dynamic import or standard import? Standard import at top is better.
        // I'll add imports at the top and the logic here.
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