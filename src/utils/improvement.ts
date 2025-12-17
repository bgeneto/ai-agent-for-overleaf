'use strict';

import OpenAI, { APIUserAbortError } from 'openai';
import {
  DEFAULT_MODEL,
  DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN
} from '../constants';
import { postProcessToken, renderPrompt } from './helper';
import { Options, TextContent, StreamChunk } from '../types';


export async function getImprovement(content: TextContent, prompt: string, options: Options, signal: AbortSignal) {
  if (!options.apiKey) {
    return "Please set your OpenAI API key in the extension options.";
  } else {
    const openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiBaseUrl,
      dangerouslyAllowBrowser: true,
    });

    try {
      const response = await openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: buildImprovePrompt(content, prompt),
          },
        ],
        model: options.model || DEFAULT_MODEL,
        max_tokens: options.suggestionMaxOutputToken ?? DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN,
      }, { signal: signal });
      return response.choices[0].message.content ?? '';
    } catch (error) {
      if (error instanceof APIUserAbortError) {
        return "The request was aborted.";
      }
      return "An error occurred while generating the content.\n" + error;
    }
  }
}

export async function* getImprovementStream(content: TextContent, prompt: string, options: Options, signal: AbortSignal):
  AsyncGenerator<StreamChunk, void, unknown> {

  if (!options.apiKey) {
    yield {
      kind: "error",
      content: "Please set your OpenAI API key in the extension options."
    };
    return;
  } else {
    console.log('[Copilot Debug] Improvement request:', {
      baseURL: options.apiBaseUrl,
      model: options.model,
      apiKeyPrefix: options.apiKey?.substring(0, 15) + '...',
    });

    const openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiBaseUrl,
      dangerouslyAllowBrowser: true,
    });

    try {
      const promptContent = buildImprovePrompt(content, prompt);
      console.log('[Copilot Debug] Prompt (first 200 chars):', promptContent.substring(0, 200));

      const stream = await openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: promptContent,
          },
        ],
        model: options.model || DEFAULT_MODEL,
        max_tokens: options.suggestionMaxOutputToken ?? DEFAULT_SUGGESTION_MAX_OUTPUT_TOKEN,
        stream: true,
      }, { signal: signal });

      console.log('[Copilot Debug] Stream started successfully');

      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        const tokenContent = chunk.choices[0]?.delta?.content || '';
        if (chunkCount <= 3) {
          console.log(`[Copilot Debug] Chunk ${chunkCount}:`, tokenContent.substring(0, 50));
        }
        yield { kind: "token", content: tokenContent };
      }
      console.log(`[Copilot Debug] Stream completed with ${chunkCount} chunks`);

    } catch (error) {
      console.error('[Copilot Debug] Error in improvement stream:', error);
      if (error instanceof APIUserAbortError) {
        console.log('[Copilot Debug] Request was aborted by user');
        return;
      }
      yield { kind: "error", content: "An error occurred while generating the content.\n" + error };
    }
  }
}

function buildImprovePrompt(content: TextContent, template: string) {
  if (!!template) {
    if (template.indexOf('<input>') >= 0)
      return template.replace('<input>', content.selection);

    return renderPrompt(template, content);
  }

  return `Rewrite and improve the following LaTeX content. Output ONLY valid LaTeX code, no markdown or explanations:\n` + `${content.selection}`;
}
