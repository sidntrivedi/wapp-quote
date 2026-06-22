import process from 'node:process';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { isSafeQuoteText } from './quote-filter.js';
import type { Quote } from './types.js';

type ReflectionConfig = Pick<
  AppConfig,
  'aiProvider' | 'ollamaBaseUrl' | 'ollamaModel' | 'openaiModel' | 'aiTimeoutMs' | 'aiTemperature'
>;

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ReflectionMessage = {
  role: 'system' | 'user';
  content: string;
};

export function validateAiEnvironment(config: ReflectionConfig): void {
  if (config.aiProvider === 'ollama-cloud' && !readOllamaApiKey()) {
    throw new Error('OLLAMA_API_KEY is required when AI_PROVIDER=ollama-cloud');
  }

  if (config.aiProvider === 'openai' && !readOpenAiApiKey()) {
    throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  }
}

export async function enrichQuoteReflection(options: {
  quote: Quote;
  config: ReflectionConfig;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}): Promise<Quote> {
  if (options.config.aiProvider === 'none') {
    return options.quote;
  }

  try {
    const reflection =
      options.config.aiProvider === 'openai'
        ? await generateOpenAiReflection(options)
        : await generateOllamaCloudReflection(options);
    return { ...options.quote, reflection };
  } catch (error) {
    options.logger?.warn({ err: error, quoteId: options.quote.id }, 'AI reflection failed; using quote fallback reflection');
    return options.quote;
  }
}

async function generateOllamaCloudReflection(options: {
  quote: Quote;
  config: ReflectionConfig;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.config.aiTimeoutMs);

  try {
    const response = await fetchImpl(`${options.config.ollamaBaseUrl}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readOllamaApiKey()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.config.ollamaModel,
        stream: false,
        messages: reflectionMessages(options.quote),
        options: {
          temperature: options.config.aiTemperature
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama Cloud request failed: ${response.status}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content;

    if (!content) {
      throw new Error(data.error ?? 'Ollama Cloud response did not include message content');
    }

    return validateReflection(parseReflectionJson(content), options.quote);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateOpenAiReflection(options: {
  quote: Quote;
  config: ReflectionConfig;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.config.aiTimeoutMs);

  try {
    const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readOpenAiApiKey()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.config.openaiModel,
        messages: reflectionMessages(options.quote),
        temperature: options.config.aiTemperature,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(data.error?.message ?? 'OpenAI response did not include message content');
    }

    return validateReflection(parseReflectionJson(content), options.quote);
  } finally {
    clearTimeout(timeout);
  }
}

function reflectionMessages(quote: Quote): ReflectionMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Return only valid JSON.',
        'Write one warm, simple, positive Hindi reflection for a family WhatsApp morning quote.',
        'Do not rewrite, translate, or explain the quote.',
        'Do not mention politics, sadness, death, conflict, guilt, fear, or criticism.',
        'Do not include the author name.',
        'JSON shape: {"reflection":"..."}'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        quote: quote.text,
        author: quote.author,
        target: 'Hindi family WhatsApp morning message',
        maxWords: 18
      })
    }
  ];
}

function readOllamaApiKey(): string {
  return process.env.OLLAMA_API_KEY?.trim() ?? '';
}

function readOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() ?? '';
}

function parseReflectionJson(content: string): string {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(trimmed) as { reflection?: unknown };

  if (typeof parsed.reflection !== 'string') {
    throw new Error('AI response JSON did not include a string reflection');
  }

  return parsed.reflection;
}

function validateReflection(reflection: string, quote: Quote): string {
  const normalized = reflection.replace(/\s+/g, ' ').trim();

  if (normalized.length < 8 || normalized.length > 140) {
    throw new Error('AI reflection length is outside the allowed range');
  }

  if (normalized.includes('\n') || normalized.includes('\r')) {
    throw new Error('AI reflection must be one line');
  }

  if (!/[ऀ-ॿ]/.test(normalized)) {
    throw new Error('AI reflection must contain Hindi text');
  }

  if (normalized.includes(quote.author) || normalized.includes(quote.text.slice(0, 16))) {
    throw new Error('AI reflection must not repeat the author or quote');
  }

  if (!isSafeQuoteText(normalized) || /(राजनीति|सरकार|युद्ध|हत्या|अपराध|नफ़रत|नफरत|बीमारी|रोग|मृत्यु|मौत|डर|भय)/.test(normalized)) {
    throw new Error('AI reflection failed safety filters');
  }

  return normalized.replace(/[।.]*$/, '।');
}
