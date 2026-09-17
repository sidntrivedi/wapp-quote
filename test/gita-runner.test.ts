import { describe, expect, it, vi } from 'vitest';
import { runDailyGita } from '../src/gita-runner.js';
import type { BotState, GitaVerse, GitaVerseBatch } from '../src/types.js';

const verses: GitaVerse[] = [
  {
    kind: 'gita',
    id: 'gita-01-001',
    label: 'भगवद्गीता 1.1',
    chapter: 1,
    verse: 1,
    sanskrit: 'धृतराष्ट्र उवाच',
    hindiMeaning: 'धृतराष्ट्र ने पूछा।'
  },
  {
    kind: 'gita',
    id: 'gita-01-002',
    label: 'भगवद्गीता 1.2',
    chapter: 1,
    verse: 2,
    sanskrit: 'सञ्जय उवाच',
    hindiMeaning: 'संजय ने कहा।'
  }
];

const batch: GitaVerseBatch = {
  kind: 'gita-batch',
  id: 'gita-01-001--gita-01-002',
  verseIds: ['gita-01-001', 'gita-01-002'],
  label: 'भगवद्गीता 1.1–1.2',
  verses
};

const config = {
  gitaApiBaseUrl: 'https://example.com',
  gitaApiTimeoutMs: 10_000,
  gitaHindiField: 'tej.ht',
  gitaVersesPerDay: 2
};

describe('runDailyGita', () => {
  it('sends a verse batch and records the local date', async () => {
    const sendText = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const state: BotState = { gitaCursor: 0, sentDates: {} };

    const result = await runDailyGita({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata',
      config,
      selectVerses: () => ({ batch, nextState: { gitaCursor: 2, sentDates: {} } })
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledOnce();

    if (result.status === 'sent') {
      expect(result.dateKey).toBe('2026-06-16');
      expect(result.nextState.sentDates['2026-06-16']).toMatchObject({
        verseIds: ['gita-01-001', 'gita-01-002'],
        label: 'भगवद्गीता 1.1–1.2',
        messageId: 'message-1'
      });
    }
  });

  it('skips an already sent date unless forced', async () => {
    const sendText = vi.fn();
    const state: BotState = {
      gitaCursor: 2,
      sentDates: {
        '2026-06-16': { verseIds: ['gita-01-001', 'gita-01-002'], label: 'भगवद्गीता 1.1–1.2', sentAt: '2026-06-16T00:31:00.000Z' }
      }
    };

    const result = await runDailyGita({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T05:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
      config,
      selectVerses: () => ({ batch, nextState: state })
    });

    expect(result).toEqual({ status: 'skipped', dateKey: '2026-06-16', verseIds: ['gita-01-001', 'gita-01-002'] });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('retries failed sends', async () => {
    const sendText = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ messageId: 'message-2' });

    const result = await runDailyGita({
      sender: { sendText },
      state: { gitaCursor: 0, sentDates: {} },
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata',
      config,
      selectVerses: () => ({ batch, nextState: { gitaCursor: 2, sentDates: {} } })
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledTimes(2);
  });

  it('does not send or update state when verse selection fails', async () => {
    const sendText = vi.fn();
    const state: BotState = { gitaCursor: 0, sentDates: {} };

    await expect(
      runDailyGita({
        sender: { sendText },
        state,
        groupJid: '123@g.us',
        now: new Date('2026-06-16T00:31:00.000Z'),
        timeZone: 'Asia/Kolkata',
        config,
        selectVerses: async () => {
          throw new Error('Gita API failed');
        }
      })
    ).rejects.toThrow(/Gita API failed/);

    expect(sendText).not.toHaveBeenCalled();
    expect(state).toEqual({ gitaCursor: 0, sentDates: {} });
  });

  it('does not advance the cursor when WhatsApp send fails', async () => {
    vi.useFakeTimers();
    try {
      const sendText = vi.fn().mockRejectedValue(new Error('WhatsApp down'));
      const state: BotState = { gitaCursor: 0, sentDates: {} };
      const nextState: BotState = { gitaCursor: 2, sentDates: {} };

      const promise = runDailyGita({
        sender: { sendText },
        state,
        groupJid: '123@g.us',
        now: new Date('2026-06-16T00:31:00.000Z'),
        timeZone: 'Asia/Kolkata',
        config,
        selectVerses: () => ({ batch, nextState })
      });
      const expectation = expect(promise).rejects.toThrow(/WhatsApp down/);
      await vi.advanceTimersByTimeAsync(3000);

      await expectation;
      expect(sendText).toHaveBeenCalledTimes(3);
      expect(state).toEqual({ gitaCursor: 0, sentDates: {} });
    } finally {
      vi.useRealTimers();
    }
  });
});
