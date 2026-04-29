'use strict';


import {
  DEFAULT_MODEL,
  DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN
} from '../constants';
import { buildImprovePrompt, buildCustomActionPrompt } from '../prompts';
import { Options, TextContent, StreamChunk } from '../types';


export async function getImprovement(content: TextContent, prompt: string, options: Options, signal: AbortSignal, isCustomAction?: boolean) {
  let fullContent = "";
  const stream = getImprovementStream(content, prompt, options, signal, isCustomAction);
  for await (const chunk of stream) {
    if (chunk.kind === 'token') {
      fullContent += chunk.content;
    } else if (chunk.kind === 'error') {
      return chunk.content;
    }
  }
  return fullContent;
}

export async function* getImprovementStream(content: TextContent, prompt: string, options: Options, signal: AbortSignal, isCustomAction?: boolean):
  AsyncGenerator<StreamChunk, void, unknown> {

  if (!options.apiKey) {
    yield {
      kind: "error",
      content: "Please set your OpenAI API key in the extension options."
    };
    return;
  }

  // Use buildCustomActionPrompt for user-defined custom actions, buildImprovePrompt for built-in actions
  const promptContent = isCustomAction
    ? buildCustomActionPrompt(content, prompt)
    : buildImprovePrompt(content, prompt);

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

  const suggestedMaxTokens = options.suggestionMaxOutputToken ?? DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN;
  const userThinkingBudget = (options.thinkingTokenBudget ?? 0) > 0 ? options.thinkingTokenBudget! : 0;
  const model = options.model || '';
  const hasThinkingSupport = /o1|o3|claude|gemini.*thinking/i.test(model);

  let effectiveMaxTokens: number;
  let thinkingTokenBudget: number = 0;

  if (hasThinkingSupport || userThinkingBudget > 0) {
    thinkingTokenBudget = userThinkingBudget > 0 ? userThinkingBudget : suggestedMaxTokens;
    effectiveMaxTokens = Math.max(
      suggestedMaxTokens,
      thinkingTokenBudget * 2,
      thinkingTokenBudget + 512
    );
  } else {
    effectiveMaxTokens = suggestedMaxTokens;
  }

  // Send start message
  port.postMessage({
    type: 'start-stream',
    payload: {
      apiKey: options.apiKey,
      apiBaseUrl: options.apiBaseUrl,
      model: options.model || DEFAULT_MODEL,
      max_tokens: effectiveMaxTokens,
      messages: [{ role: 'user', content: promptContent }],
      ...(thinkingTokenBudget && { thinking_token_budget: thinkingTokenBudget })
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
