import { describe, expect, it, vi } from 'vitest';
import { runDailyQuote } from '../src/quote-runner.js';
import type { BotState, Quote } from '../src/types.js';

const quoteBank: Quote[] = [
  {
    id: 'q1',
    text: 'धीरे-धीरे रे मना',
    author: 'कबीर',
    language: 'hi',
    mood: 'hopeful',
    reflection: 'धैर्य रखिए।'
  }
];

describe('runDailyQuote', () => {
  it('sends a quote and records the local date', async () => {
    const sendText = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };

    const result = await runDailyQuote({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata',
      selectQuote: () => ({ quote: quoteBank[0], nextState: { rotationIndex: 0, usedQuoteIds: ['q1'], sentDates: {} } })
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledOnce();

    if (result.status === 'sent') {
      expect(result.dateKey).toBe('2026-06-16');
      expect(result.nextState.sentDates['2026-06-16']).toMatchObject({ quoteId: 'q1', author: 'कबीर', messageId: 'message-1' });
    }
  });

  it('skips an already sent date unless forced', async () => {
    const sendText = vi.fn();
    const state: BotState = {
      rotationIndex: 0,
      usedQuoteIds: ['q1'],
      sentDates: {
        '2026-06-16': { quoteId: 'q1', author: 'कबीर', sentAt: '2026-06-16T00:31:00.000Z' }
      }
    };

    const result = await runDailyQuote({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T05:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
      selectQuote: () => ({ quote: quoteBank[0], nextState: state })
    });

    expect(result).toEqual({ status: 'skipped', dateKey: '2026-06-16', quoteId: 'q1' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('retries failed sends', async () => {
    const sendText = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ messageId: 'message-2' });

    const result = await runDailyQuote({
      sender: { sendText },
      state: { rotationIndex: 0, usedQuoteIds: [], sentDates: {} },
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata',
      selectQuote: () => ({ quote: quoteBank[0], nextState: { rotationIndex: 0, usedQuoteIds: ['q1'], sentDates: {} } })
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledTimes(2);
  });

  it('uses a custom renderer before sending', async () => {
    const sendText = vi.fn().mockResolvedValue({ messageId: 'message-3' });

    await runDailyQuote({
      sender: { sendText },
      state: { rotationIndex: 0, usedQuoteIds: [], sentDates: {} },
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata',
      selectQuote: () => ({ quote: quoteBank[0], nextState: { rotationIndex: 0, usedQuoteIds: ['q1'], sentDates: {} } }),
      renderMessage: (quote) => `rendered:${quote.id}`
    });

    expect(sendText).toHaveBeenCalledWith('123@g.us', 'rendered:q1');
  });

  it('forces a resend when already sent today', async () => {
    const sendText = vi.fn().mockResolvedValue({ messageId: 'message-4' });
    const state: BotState = {
      rotationIndex: 0,
      usedQuoteIds: ['q1'],
      sentDates: {
        '2026-06-16': { quoteId: 'q1', author: 'कबीर', sentAt: '2026-06-16T00:31:00.000Z' }
      }
    };

    const result = await runDailyQuote({
      sender: { sendText },
      state,
      groupJid: '123@g.us',
      now: new Date('2026-06-16T05:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
      force: true,
      selectQuote: () => ({ quote: quoteBank[0], nextState: state })
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledOnce();
  });

  it('uses the default quote selector and renderer when omitted', async () => {
    const sendText = vi.fn().mockResolvedValue({ messageId: 'message-5' });

    const result = await runDailyQuote({
      sender: { sendText },
      state: { rotationIndex: 0, usedQuoteIds: [], sentDates: {} },
      groupJid: '123@g.us',
      now: new Date('2026-06-16T00:31:00.000Z'),
      timeZone: 'Asia/Kolkata'
    });

    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledOnce();
    expect(String(sendText.mock.calls[0]?.[1])).toContain('🌅 सुप्रभात');
  });
});
