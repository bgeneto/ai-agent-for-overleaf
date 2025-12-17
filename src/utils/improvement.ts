'use strict';


import {
  DEFAULT_MODEL,
  DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN
} from '../constants';
import { buildImprovePrompt } from '../prompts';
import { Options, TextContent, StreamChunk } from '../types';


export async function getImprovement(content: TextContent, prompt: string, options: Options, signal: AbortSignal) {
  let fullContent = "";
  const stream = getImprovementStream(content, prompt, options, signal);
  for await (const chunk of stream) {
    if (chunk.kind === 'token') {
      fullContent += chunk.content;
    } else if (chunk.kind === 'error') {
      return chunk.content;
    }
  }
  return fullContent;
}

export async function* getImprovementStream(content: TextContent, prompt: string, options: Options, signal: AbortSignal):
  AsyncGenerator<StreamChunk, void, unknown> {

  if (!options.apiKey) {
    yield {
      kind: "error",
      content: "Please set your OpenAI API key in the extension options."
    };
    return;
  }

  const promptContent = buildImprovePrompt(content, prompt);

  // Connect to background script
  const port = chrome.runtime.connect({ name: 'openai-stream' });

  // Promisify the stream for generator usage
  // We need to queue incoming messages and yield them
  const queue: any[] = [];
  let resolveNext: ((value?: any) => void) | null = null;
  let isDone = false;
  let error: any = null;

  port.onMessage.addListener((msg) => {
    queue.push(msg);
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  port.onDisconnect.addListener(() => {
    isDone = true;
    if (resolveNext) resolveNext();
  });

  // Handle user abort
  if (signal) {
    signal.addEventListener('abort', () => {
      port.disconnect();
      isDone = true;
      if (resolveNext) resolveNext();
    });
  }

  // Send start message
  port.postMessage({
    type: 'start-stream',
    payload: {
      apiKey: options.apiKey,
      apiBaseUrl: options.apiBaseUrl,
      model: options.model || DEFAULT_MODEL,
      max_tokens: options.suggestionMaxOutputToken ?? DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN,
      messages: [{ role: 'user', content: promptContent }]
    }
  });

  try {
    while (true) {
      if (queue.length > 0) {
        const msg = queue.shift();
        if (msg.kind === 'token') {
          yield { kind: 'token', content: msg.content };
        } else if (msg.kind === 'error') {
          yield { kind: 'error', content: msg.content };
          return;
        } else if (msg.kind === 'done') {
          return;
        }
      } else {
        if (isDone) return;
        // Wait for next message
        await new Promise<void>((resolve) => { resolveNext = resolve; });
      }
    }
  } finally {
    port.disconnect();
  }
}
