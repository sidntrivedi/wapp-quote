import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichQuoteReflection, validateAiEnvironment } from '../src/ai-reflection.js';
import type { AppConfig } from '../src/config.js';
import type { Quote } from '../src/types.js';

const quote: Quote = {
  id: 'q1',
  text: 'विश्वास व्यक्ति को सिद्धि देता है ।',
  author: 'चाणक्य',
  language: 'hi',
  mood: 'wisdom',
  reflection: 'आज इस पंक्ति को मन में रखकर दिन की शुरुआत शांत और अच्छे भाव से करें।'
};

const baseConfig = {
  aiProvider: 'ollama-cloud',
  ollamaBaseUrl: 'https://ollama.com/api',
  ollamaModel: 'gpt-oss:120b',
  openaiModel: 'gpt-4o-mini',
  aiTimeoutMs: 1000,
  aiTemperature: 0.7
} satisfies Pick<
  AppConfig,
  'aiProvider' | 'ollamaBaseUrl' | 'ollamaModel' | 'openaiModel' | 'aiTimeoutMs' | 'aiTemperature'
>;

describe('enrichQuoteReflection', () => {
  const originalOllamaApiKey = process.env.OLLAMA_API_KEY;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OLLAMA_API_KEY = 'test-ollama-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    if (originalOllamaApiKey === undefined) {
      delete process.env.OLLAMA_API_KEY;
    } else {
      process.env.OLLAMA_API_KEY = originalOllamaApiKey;
    }

    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
  });

  it('validates the Ollama Cloud key from process.env', () => {
    delete process.env.OLLAMA_API_KEY;

    expect(() => validateAiEnvironment(baseConfig)).toThrow(/OLLAMA_API_KEY/);

    process.env.OLLAMA_API_KEY = 'test-ollama-key';
    expect(() => validateAiEnvironment(baseConfig)).not.toThrow();
  });

  it('validates the OpenAI key from process.env', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => validateAiEnvironment({ ...baseConfig, aiProvider: 'openai' })).toThrow(/OPENAI_API_KEY/);

    process.env.OPENAI_API_KEY = 'test-openai-key';
    expect(() => validateAiEnvironment({ ...baseConfig, aiProvider: 'openai' })).not.toThrow();
  });

  it('keeps the original reflection when AI is disabled', async () => {
    const enriched = await enrichQuoteReflection({
      quote,
      config: { ...baseConfig, aiProvider: 'none' }
    });

    expect(enriched.reflection).toBe(quote.reflection);
  });

  it('uses a validated Ollama Cloud reflection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ reflection: 'आज भरोसे के साथ छोटे कदम बढ़ाइए' })
          }
        })
      )
    );

    const enriched = await enrichQuoteReflection({ quote, config: baseConfig, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ollama.com/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-ollama-key'
        })
      })
    );
    expect(enriched.reflection).toBe('आज भरोसे के साथ छोटे कदम बढ़ाइए।');
  });

  it('uses a validated OpenAI reflection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ reflection: 'आज मन को शांत और उम्मीद भरा रखिए' })
              }
            }
          ]
        })
      )
    );

    const enriched = await enrichQuoteReflection({
      quote,
      config: { ...baseConfig, aiProvider: 'openai' },
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-openai-key'
        }),
        body: expect.stringContaining('"response_format":{"type":"json_object"}')
      })
    );
    expect(enriched.reflection).toBe('आज मन को शांत और उम्मीद भरा रखिए।');
  });

  it('falls back to the original reflection when AI output is unsafe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ reflection: 'आज राजनीति और डर के बारे में सोचिए' })
          }
        })
      )
    );

    const enriched = await enrichQuoteReflection({ quote, config: baseConfig, fetchImpl });

    expect(enriched.reflection).toBe(quote.reflection);
  });

  it('falls back when the AI request fails', async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network timeout'));

    const enriched = await enrichQuoteReflection({
      quote,
      config: baseConfig,
      fetchImpl,
      logger: { warn } as never
    });

    expect(enriched.reflection).toBe(quote.reflection);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 'q1' }),
      'AI reflection failed; using quote fallback reflection'
    );
  });

  it('falls back when the AI response is malformed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: '{"notReflection":"oops"}' } }))
    );

    const enriched = await enrichQuoteReflection({ quote, config: baseConfig, fetchImpl });

    expect(enriched.reflection).toBe(quote.reflection);
  });
});
