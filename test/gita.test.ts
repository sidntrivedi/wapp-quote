import { describe, expect, it, vi } from 'vitest';
import { fetchGitaVerse, gitaIndexFromPosition, gitaPositionFromIndex, selectNextGitaVerse } from '../src/gita.js';
import type { BotState } from '../src/types.js';

function gitaResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

const validPayload = {
  chapter: 1,
  verse: 1,
  slok: 'धृतराष्ट्र उवाच',
  tej: { ht: 'धृतराष्ट्र ने संजय से पूछा।' }
};

describe('gita source', () => {
  it('fetches /slok/1/1/ and extracts Sanskrit plus preferred Hindi meaning', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(gitaResponse(validPayload));

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
      sanskrit: 'धृतराष्ट्र उवाच',
      hindiMeaning: 'धृतराष्ट्र ने संजय से पूछा।'
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

  it('selects chapter 1 verse 1 for a new cursor and advances returned state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(gitaResponse(validPayload));
    const state: BotState = { gitaCursor: 0, sentDates: {} };

    const result = await selectNextGitaVerse({
      config: { gitaApiBaseUrl: 'https://example.com', gitaApiTimeoutMs: 10_000, gitaHindiField: 'tej.ht' },
      state,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/slok/1/1/', expect.any(Object));
    expect(result.verse.id).toBe('gita-01-001');
    expect(result.nextState.gitaCursor).toBe(1);
    expect(state.gitaCursor).toBe(0);
  });

  it('wraps from 18.78 back to 1.1', async () => {
    const lastIndex = gitaIndexFromPosition(18, 78);
    const fetchImpl = vi.fn().mockResolvedValue(
      gitaResponse({
        chapter: 18,
        verse: 78,
        slok: 'यत्र योगेश्वरः कृष्णः',
        tej: { ht: 'जहाँ योगेश्वर श्रीकृष्ण हैं।' }
      })
    );

    const result = await selectNextGitaVerse({
      config: { gitaApiBaseUrl: 'https://example.com', gitaApiTimeoutMs: 10_000, gitaHindiField: 'tej.ht' },
      state: { gitaCursor: lastIndex, sentDates: {} },
      fetchImpl
    });

    expect(result.verse.id).toBe('gita-18-078');
    expect(result.nextState.gitaCursor).toBe(0);
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
