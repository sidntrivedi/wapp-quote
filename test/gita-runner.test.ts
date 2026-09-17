import { describe, expect, it, vi } from 'vitest';
import { runDailyGita } from '../src/gita-runner.js';
import type { BotState, GitaVerse } from '../src/types.js';

const gitaVerse: GitaVerse = {
  kind: 'gita',
  id: 'gita-01-001',
  label: 'भगवद्गीता 1.1',
  chapter: 1,
  verse: 1,
  sanskrit: 'धृतराष्ट्र उवाच',
  hindiMeaning: 'धृतराष्ट्र ने पूछा।'
};

const config = {
  gitaApiBaseUrl: 'https://example.com',
  gitaApiTimeoutMs: 10_000,
  gitaHindiField: 'tej.ht'
};

describe('runDailyGita', () => {
  it('sends a verse and records the local date', async () => {
    const sendText = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const state: BotState = { gitaCursor: 0, sentDates: {} };

    const result = await runDailyGita({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata',
      config,
      selectVerse: () => ({ verse: gitaVerse, nextState: { gitaCursor: 1, sentDates: {} } })
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledOnce();

    if (result.status === 'sent') {
      expect(result.dateKey).toBe('2026-06-16');
      expect(result.nextState.sentDates['2026-06-16']).toMatchObject({
        verseId: 'gita-01-001',
        label: 'भगवद्गीता 1.1',
        messageId: 'message-1'
      });
    }
  });

  it('skips an already sent date unless forced', async () => {
    const sendText = vi.fn();
    const state: BotState = {
      gitaCursor: 1,
      sentDates: {
        '2026-06-16': { verseId: 'gita-01-001', label: 'भगवद्गीता 1.1', sentAt: '2026-06-16T00:31:00.000Z' }
      }
    };

    const result = await runDailyGita({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T05:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
      config,
      selectVerse: () => ({ verse: gitaVerse, nextState: state })
    });

    expect(result).toEqual({ status: 'skipped', dateKey: '2026-06-16', verseId: 'gita-01-001' });
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
      selectVerse: () => ({ verse: gitaVerse, nextState: { gitaCursor: 1, sentDates: {} } })
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
        selectVerse: async () => {
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
      const nextState: BotState = { gitaCursor: 1, sentDates: {} };

      const promise = runDailyGita({
        sender: { sendText },
        state,
        groupJid: '123@g.us',
        now: new Date('2026-06-16T00:31:00.000Z'),
        timeZone: 'Asia/Kolkata',
        config,
        selectVerse: () => ({ verse: gitaVerse, nextState })
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
