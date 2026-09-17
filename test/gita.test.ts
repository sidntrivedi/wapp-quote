import { describe, expect, it, vi } from 'vitest';
import { fetchGitaVerse, gitaIndexFromPosition, gitaPositionFromIndex, selectNextGitaVerses } from '../src/gita.js';
import type { BotState } from '../src/types.js';

function gitaResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

function payload(chapter: number, verse: number): unknown {
  return {
    chapter,
    verse,
    slok: `श्लोक ${chapter}.${verse}`,
    tej: { ht: `भावार्थ ${chapter}.${verse} है।` }
  };
}

describe('gita source', () => {
  it('fetches /slok/1/1/ and extracts Sanskrit plus preferred Hindi meaning', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(gitaResponse(payload(1, 1)));

    const verse = await fetchGitaVerse(1, 1, {
      baseUrl: 'https://example.com/',
      timeoutMs: 10_000,
      hindiField: 'tej.ht',
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/slok/1/1/', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(verse).toMatchObject({
      id: 'gita-01-001',
      label: 'भगवद्गीता 1.1',
      chapter: 1,
      verse: 1,
      sanskrit: 'श्लोक 1.1',
      hindiMeaning: 'भावार्थ 1.1 है।'
    });
  });

  it('falls back to the first valid Hindi meaning field when preferred field is absent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      gitaResponse({
        chapter: 1,
        verse: 1,
        slok: 'धृतराष्ट्र उवाच',
        other: { meaning: 'This is English.' },
        chinmay: { hc: 'यह हिन्दी भावार्थ है।' }
      })
    );

    const verse = await fetchGitaVerse(1, 1, {
      baseUrl: 'https://example.com',
      timeoutMs: 10_000,
      hindiField: 'tej.ht',
      fetchImpl
    });

    expect(verse.hindiMeaning).toBe('यह हिन्दी भावार्थ है।');
  });

  it('selects two verses for a new cursor and advances returned state by two', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const match = String(url).match(/\/slok\/(\d+)\/(\d+)\//);
      return gitaResponse(payload(Number(match?.[1]), Number(match?.[2])));
    });
    const state: BotState = { gitaCursor: 0, sentDates: {} };

    const result = await selectNextGitaVerses({
      config: { gitaApiBaseUrl: 'https://example.com', gitaApiTimeoutMs: 10_000, gitaHindiField: 'tej.ht', gitaVersesPerDay: 2 },
      state,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/slok/1/1/', expect.any(Object));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://example.com/slok/1/2/', expect.any(Object));
    expect(result.batch.verseIds).toEqual(['gita-01-001', 'gita-01-002']);
    expect(result.batch.label).toBe('भगवद्गीता 1.1–1.2');
    expect(result.nextState.gitaCursor).toBe(2);
    expect(state.gitaCursor).toBe(0);
  });

  it('wraps a two-verse batch from 18.78 back to 1.1', async () => {
    const lastIndex = gitaIndexFromPosition(18, 78);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const match = String(url).match(/\/slok\/(\d+)\/(\d+)\//);
      return gitaResponse(payload(Number(match?.[1]), Number(match?.[2])));
    });

    const result = await selectNextGitaVerses({
      config: { gitaApiBaseUrl: 'https://example.com', gitaApiTimeoutMs: 10_000, gitaHindiField: 'tej.ht', gitaVersesPerDay: 2 },
      state: { gitaCursor: lastIndex, sentDates: {} },
      fetchImpl
    });

    expect(result.batch.verseIds).toEqual(['gita-18-078', 'gita-01-001']);
    expect(result.batch.label).toBe('भगवद्गीता 18.78–1.1');
    expect(result.nextState.gitaCursor).toBe(1);
    expect(gitaPositionFromIndex(lastIndex)).toEqual({ chapter: 18, verse: 78 });
  });

  it('rejects invalid API responses instead of producing fallback content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(gitaResponse({ chapter: 1, verse: 1, slok: 'धृतराष्ट्र उवाच', tej: { ht: 'English only' } }));

    await expect(
      fetchGitaVerse(1, 1, {
        baseUrl: 'https://example.com',
        timeoutMs: 10_000,
        hindiField: 'tej.ht',
        fetchImpl
      })
    ).rejects.toThrow(/Hindi meaning/);
  });
});
