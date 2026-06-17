import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { interleaveByAuthor, quoteBank, selectNextQuote } from './quotes.js';
import { fetchWikiquoteQuotes } from './wikiquote.js';
import type { BotState, Quote } from './types.js';

export async function selectQuote(options: {
  config: Pick<
    AppConfig,
    'quoteSource' | 'wikiquoteLanguage' | 'wikiquoteMode' | 'wikiquoteCategories' | 'wikiquotePages' | 'wikiquoteRandomPageLimit'
  >;
  state: BotState;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}): Promise<{ quote: Quote; nextState: BotState }> {
  if (options.config.quoteSource === 'wikiquote') {
    try {
      const apiQuotes = await fetchWikiquoteQuotes({
        language: options.config.wikiquoteLanguage,
        mode: options.config.wikiquoteMode,
        categories: options.config.wikiquoteCategories,
        pages: options.config.wikiquotePages,
        randomPageLimit: options.config.wikiquoteRandomPageLimit,
        fetchImpl: options.fetchImpl
      });

      const selected = selectUniqueQuote(apiQuotes, options.state);

      if (selected) {
        return selected;
      }

      options.logger?.warn({ count: apiQuotes.length }, 'wikiquote returned no unused safe quotes; falling back to local bank');
    } catch (error) {
      options.logger?.warn({ error }, 'wikiquote quote fetch failed; falling back to local bank');
    }
  }

  const local = selectNextQuote(options.state, quoteBank);

  return {
    quote: local.quote,
    nextState: {
      ...local.nextState,
      usedQuoteIds: appendUsedQuoteId(local.nextState.usedQuoteIds, local.quote.id)
    }
  };
}

function selectUniqueQuote(quotes: Quote[], state: BotState): { quote: Quote; nextState: BotState } | undefined {
  if (quotes.length === 0) {
    return undefined;
  }

  const used = new Set(state.usedQuoteIds);
  const candidates = quotes.filter((quote) => !used.has(quote.id));
  const pool = interleaveByAuthor(candidates.length > 0 ? candidates : quotes);
  const index = state.rotationIndex % pool.length;
  const quote = pool[index];

  return {
    quote,
    nextState: {
      ...state,
      rotationIndex: (state.rotationIndex + 1) % Math.max(pool.length, 1),
      usedQuoteIds: appendUsedQuoteId(state.usedQuoteIds, quote.id)
    }
  };
}

function appendUsedQuoteId(ids: string[], id: string): string[] {
  return [...ids.filter((existing) => existing !== id), id].slice(-1000);
}
