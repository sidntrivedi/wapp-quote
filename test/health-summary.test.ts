import { describe, expect, it, vi } from 'vitest';
import { generateHealthSummary } from '../src/health-summary.js';
import type { HealthInsights } from '../src/health-message.js';
import type { HealthEntry } from '../src/health-types.js';

const entry: HealthEntry = { date: '2026-06-21', steps: 9000, sleepHours: 7.5, receivedAt: 'x' };
const insights: HealthInsights = { stepGoal: 8000, metStepGoal: true, streakDays: 3 };

const baseConfig = {
  ollamaBaseUrl: 'https://ollama.com/api',
  ollamaModel: 'gpt-oss:120b',
  openaiModel: 'gpt-4o-mini',
  aiTimeoutMs: 10000,
  aiTemperature: 0.7
};

describe('generateHealthSummary', () => {
  it('returns undefined when AI is disabled', async () => {
    const result = await generateHealthSummary({
      entry,
      insights,
      config: { ...baseConfig, aiProvider: 'none' }
    });
    expect(result).toBeUndefined();
  });

  it('returns a validated Hindi summary from openai', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"summary":"बढ़िया! आज लक्ष्य पूरा हुआ।"}' } }] })
    });

    const result = await generateHealthSummary({
      entry,
      insights,
      config: { ...baseConfig, aiProvider: 'openai' },
      fetchImpl: fetchImpl as never
    });

    expect(result).toBe('बढ़िया! आज लक्ष्य पूरा हुआ।');
    delete process.env.OPENAI_API_KEY;
  });

  it('falls back to undefined on a non-Hindi summary', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"summary":"Great job today!"}' } }] })
    });

    const result = await generateHealthSummary({
      entry,
      insights,
      config: { ...baseConfig, aiProvider: 'openai' },
      fetchImpl: fetchImpl as never
    });

    expect(result).toBeUndefined();
    delete process.env.OPENAI_API_KEY;
  });

  it('falls back to undefined on an HTTP error', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    const result = await generateHealthSummary({
      entry,
      insights,
      config: { ...baseConfig, aiProvider: 'openai' },
      fetchImpl: fetchImpl as never
    });

    expect(result).toBeUndefined();
    delete process.env.OPENAI_API_KEY;
  });
});
