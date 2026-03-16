/**
 * Orion CLI - Unified AI Client
 * Supports Anthropic, OpenAI, and Ollama providers
 * Auto-detects Ollama availability, streams responses to terminal
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import chalk from 'chalk';
import { readConfig, colors } from './utils.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export type AIProvider = 'anthropic' | 'openai' | 'ollama';

interface ProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
}

// ─── Ollama Detection ────────────────────────────────────────────────────────

async function isOllamaAvailable(host: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${host}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Resolve Provider Config ─────────────────────────────────────────────────

async function resolveProviderConfig(): Promise<ProviderConfig> {
  const config = readConfig();

  const anthropicKey = process.env.ANTHROPIC_API_KEY || config.anthropicApiKey;
  const openaiKey = process.env.OPENAI_API_KEY || config.openaiApiKey;
  const ollamaHost = config.ollamaHost || 'http://localhost:11434';
  const maxTokens = config.maxTokens || 4096;
  const temperature = config.temperature || 0.7;

  // If user has explicitly set a provider, use it
  if (config.provider === 'anthropic' && anthropicKey) {
    return {
      provider: 'anthropic',
      model: config.model || 'claude-sonnet-4-20250514',
      apiKey: anthropicKey,
      maxTokens,
      temperature,
    };
  }

  if (config.provider === 'openai' && openaiKey) {
    return {
      provider: 'openai',
      model: config.model || 'gpt-4o',
      apiKey: openaiKey,
      maxTokens,
      temperature,
    };
  }

  if (config.provider === 'ollama') {
    const available = await isOllamaAvailable(ollamaHost);
    if (available) {
      return {
        provider: 'ollama',
        model: config.model || 'llama3.2',
        baseUrl: ollamaHost,
        maxTokens,
        temperature,
      };
    }
  }

  // Auto-detect: try Ollama first, then Anthropic, then OpenAI
  const ollamaUp = await isOllamaAvailable(ollamaHost);
  if (ollamaUp) {
    return {
      provider: 'ollama',
      model: config.model || 'llama3.2',
      baseUrl: ollamaHost,
      maxTokens,
      temperature,
    };
  }

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      model: config.model || 'claude-sonnet-4-20250514',
      apiKey: anthropicKey,
      maxTokens,
      temperature,
    };
  }

  if (openaiKey) {
    return {
      provider: 'openai',
      model: config.model || 'gpt-4o',
      apiKey: openaiKey,
      maxTokens,
      temperature,
    };
  }

  throw new Error(
    `No AI provider available.\n\n` +
    `  ${chalk.bold('Options:')}\n` +
    `  1. Start Ollama locally     ${chalk.dim('(ollama serve)')}\n` +
    `  2. Set ANTHROPIC_API_KEY    ${chalk.dim('(export ANTHROPIC_API_KEY=sk-..)')}\n` +
    `  3. Set OPENAI_API_KEY       ${chalk.dim('(export OPENAI_API_KEY=sk-..)')}\n` +
    `  4. Run: orion config        ${chalk.dim('(interactive setup)')}\n`
  );
}

// ─── Stream via Anthropic ────────────────────────────────────────────────────

async function streamAnthropic(
  messages: AIMessage[],
  config: ProviderConfig,
  callbacks: AIStreamCallbacks
): Promise<string> {
  const client = new Anthropic({ apiKey: config.apiKey });

  // Extract system message
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  let fullText = '';

  const stream = await client.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: systemMsg?.content || '',
    messages: chatMessages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const token = event.delta.text;
      fullText += token;
      callbacks.onToken?.(token);
    }
  }

  callbacks.onComplete?.(fullText);
  return fullText;
}

// ─── Stream via OpenAI ───────────────────────────────────────────────────────

async function streamOpenAI(
  messages: AIMessage[],
  config: ProviderConfig,
  callbacks: AIStreamCallbacks
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey });

  let fullText = '';

  const stream = await client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream: true,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || '';
    if (token) {
      fullText += token;
      callbacks.onToken?.(token);
    }
  }

  callbacks.onComplete?.(fullText);
  return fullText;
}

// ─── Stream via Ollama ───────────────────────────────────────────────────────

async function streamOllama(
  messages: AIMessage[],
  config: ProviderConfig,
  callbacks: AIStreamCallbacks
): Promise<string> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';

  // Try streaming first, fall back to non-streaming
  let fullText = '';

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        options: { temperature: config.temperature, num_predict: config.maxTokens },
      }),
    });

    if (!response.ok) {
      throw new Error(`${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(Boolean)) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullText += data.message.content;
            callbacks.onToken?.(data.message.content);
          }
        } catch { /* skip */ }
      }
    }
  } catch {
    // Fallback: non-streaming request
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: { temperature: config.temperature, num_predict: config.maxTokens },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { message?: { content?: string } };
    fullText = data.message?.content || '';
    callbacks.onToken?.(fullText);
  }

  callbacks.onComplete?.(fullText);
  return fullText;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send messages to AI and stream the response
 */
export async function streamChat(
  messages: AIMessage[],
  callbacks: AIStreamCallbacks = {}
): Promise<string> {
  const config = await resolveProviderConfig();

  try {
    switch (config.provider) {
      case 'anthropic':
        return await streamAnthropic(messages, config, callbacks);
      case 'openai':
        return await streamOpenAI(messages, config, callbacks);
      case 'ollama':
        return await streamOllama(messages, config, callbacks);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  } catch (err: any) {
    callbacks.onError?.(err);
    throw err;
  }
}

/**
 * Simple one-shot: system prompt + user message, returns full response
 */
export async function askAI(
  systemPrompt: string,
  userMessage: string,
  callbacks: AIStreamCallbacks = {}
): Promise<string> {
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  return streamChat(messages, callbacks);
}

/**
 * Get the currently resolved provider info (for display)
 */
export async function getProviderInfo(): Promise<{ provider: string; model: string }> {
  try {
    const config = await resolveProviderConfig();
    return { provider: config.provider, model: config.model };
  } catch {
    return { provider: 'none', model: 'none' };
  }
}

/**
 * Stream response to stdout with formatting
 */
export function createTerminalStreamCallbacks(): AIStreamCallbacks {
  let inCodeBlock = false;
  let buffer = '';

  return {
    onToken(token: string) {
      buffer += token;

      // Detect code blocks for coloring
      const ticks = buffer.match(/```/g);
      if (ticks) {
        inCodeBlock = (ticks.length % 2) === 1;
      }

      if (inCodeBlock) {
        process.stdout.write(colors.code(token));
      } else {
        process.stdout.write(colors.ai(token));
      }
    },
    onComplete() {
      process.stdout.write('\n');
    },
    onError(error: Error) {
      console.error(colors.error(`\nAI Error: ${error.message}`));
    },
  };
}
