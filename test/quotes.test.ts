import { describe, expect, it } from 'vitest';
import { selectNextQuote } from '../src/quotes.js';
import type { BotState, Quote } from '../src/types.js';

const bank: Quote[] = [
  { id: 'a1', text: 'A1', author: 'Author A', language: 'hi', mood: 'wisdom', reflection: 'A reflection' },
  { id: 'a2', text: 'A2', author: 'Author A', language: 'hi', mood: 'wisdom', reflection: 'A reflection' },
  { id: 'b1', text: 'B1', author: 'Author B', language: 'ur', mood: 'hopeful', reflection: 'B reflection' }
];

describe('selectNextQuote', () => {
  it('uses the rotation cursor and advances it', () => {
    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };

    const first = selectNextQuote(state, bank);
    expect(first.quote.id).toBe('a1');
    expect(first.nextState.rotationIndex).toBe(1);

    const second = selectNextQuote(first.nextState, bank);
    expect(second.quote.id).toBe('b1');
    expect(second.nextState.rotationIndex).toBe(2);
  });

  it('wraps large cursor values', () => {
    const state: BotState = { rotationIndex: 7, usedQuoteIds: [], sentDates: {} };
    expect(selectNextQuote(state, bank).quote.id).toBe('b1');
  });
});
