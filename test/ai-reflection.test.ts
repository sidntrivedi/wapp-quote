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
  aiTimeoutMs: 1000,
  aiTemperature: 0.7
} satisfies Pick<
  AppConfig,
  'aiProvider' | 'ollamaBaseUrl' | 'ollamaModel' | 'aiTimeoutMs' | 'aiTemperature'
>;

describe('enrichQuoteReflection', () => {
  const originalOllamaApiKey = process.env.OLLAMA_API_KEY;

  beforeEach(() => {
    process.env.OLLAMA_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalOllamaApiKey === undefined) {
      delete process.env.OLLAMA_API_KEY;
    } else {
      process.env.OLLAMA_API_KEY = originalOllamaApiKey;
    }
  });

  it('validates the Ollama Cloud key from process.env', () => {
    delete process.env.OLLAMA_API_KEY;

    expect(() => validateAiEnvironment(baseConfig)).toThrow(/OLLAMA_API_KEY/);

    process.env.OLLAMA_API_KEY = 'test-key';
    expect(() => validateAiEnvironment(baseConfig)).not.toThrow();
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
          Authorization: 'Bearer test-key'
        })
      })
    );
    expect(enriched.reflection).toBe('आज भरोसे के साथ छोटे कदम बढ़ाइए।');
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
});
