import quotes from './data/quotes.json' with { type: 'json' };
import type { BotState, Quote } from './types.js';

export const quoteBank = quotes as Quote[];

export function selectNextQuote(state: BotState, bank: Quote[] = quoteBank): { quote: Quote; nextState: BotState } {
  if (bank.length === 0) {
    throw new Error('Quote bank is empty.');
  }

  const pool = interleaveByAuthor(bank);
  const index = positiveModulo(state.rotationIndex, pool.length);
  const quote = pool[index];

  return {
    quote,
    nextState: {
      ...state,
      rotationIndex: positiveModulo(index + 1, pool.length)
    }
  };
}

export function getQuoteForPreview(state: BotState, bank: Quote[] = quoteBank): Quote {
  const pool = interleaveByAuthor(bank);
  return pool[positiveModulo(state.rotationIndex, pool.length)];
}

export function interleaveByAuthor(quotes: Quote[]): Quote[] {
  const groups = new Map<string, Quote[]>();

  for (const quote of quotes) {
    const group = groups.get(quote.author) ?? [];
    group.push(quote);
    groups.set(quote.author, group);
  }

  const result: Quote[] = [];
  const groupedQuotes = [...groups.values()];
  let added = true;
  let index = 0;

  while (added) {
    added = false;

    for (const group of groupedQuotes) {
      const quote = group[index];
      if (quote) {
        result.push(quote);
        added = true;
      }
    }

    index += 1;
  }

  return result;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
