import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { quoteBank, selectNextQuote } from './quotes.js';
import { fetchWikiquoteQuotes } from './wikiquote.js';
import type { BotState, Quote } from './types.js';

export class ScheduledAuthorUnavailableError extends Error {
  constructor(
    readonly author: string,
    readonly page: string
  ) {
    super(`Scheduled Wikiquote author has no usable quotes: ${author} (${page})`);
    this.name = 'ScheduledAuthorUnavailableError';
  }
}

export async function selectQuote(options: {
  config: Pick<
    AppConfig,
    'quoteSource' | 'wikiquoteLanguage' | 'wikiquoteMode' | 'wikiquoteCategories' | 'wikiquotePages' | 'wikiquoteRandomPageLimit'
  >;
  state: BotState;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  preview?: boolean;
}): Promise<{ quote: Quote; nextState: BotState }> {
  if (options.config.quoteSource === 'wikiquote') {
    try {
      if (options.config.wikiquoteMode === 'pages' && options.config.wikiquotePages.length > 0) {
        const selected = await selectRotatingWikiquoteQuote(options);

        if (selected) {
          return selected;
        }

        if (options.preview) {
          const pageIndex = positiveModulo(options.state.rotationIndex, options.config.wikiquotePages.length);
          const page = options.config.wikiquotePages[pageIndex];
          throw new ScheduledAuthorUnavailableError(page.author, page.page);
        }

        options.logger?.warn('wikiquote author rotation found no usable quotes; falling back to local bank');
      } else {
        const apiQuotes = await fetchWikiquoteQuotes({
          language: options.config.wikiquoteLanguage,
          mode: options.config.wikiquoteMode,
          categories: options.config.wikiquoteCategories,
          pages: options.config.wikiquotePages,
          randomPageLimit: options.config.wikiquoteRandomPageLimit,
          fetchImpl: options.fetchImpl
        });

        const selected = selectFromQuotePool(apiQuotes, options.state);

        if (selected) {
          return selected;
        }

        options.logger?.warn({ count: apiQuotes.length }, 'wikiquote returned no unused safe quotes; falling back to local bank');
      }
    } catch (error) {
      if (error instanceof ScheduledAuthorUnavailableError) {
        throw error;
      }

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

async function selectRotatingWikiquoteQuote(options: {
  config: Pick<
    AppConfig,
    'wikiquoteLanguage' | 'wikiquoteCategories' | 'wikiquotePages' | 'wikiquoteRandomPageLimit'
  >;
  state: BotState;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  preview?: boolean;
}): Promise<{ quote: Quote; nextState: BotState } | undefined> {
  const pages = options.config.wikiquotePages;
  let rotationIndex = options.state.rotationIndex;
  const skippedAuthors: string[] = [];
  const maxAttempts = options.preview ? 1 : pages.length;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pageIndex = positiveModulo(rotationIndex, pages.length);
    const page = pages[pageIndex];

    const quotes = await fetchWikiquoteQuotes({
      language: options.config.wikiquoteLanguage,
      mode: 'pages',
      categories: options.config.wikiquoteCategories,
      pages: [page],
      randomPageLimit: options.config.wikiquoteRandomPageLimit,
      fetchImpl: options.fetchImpl
    });

    const quote = pickQuoteFromAuthorPool(quotes, options.state);
    if (quote) {
      if (skippedAuthors.length > 0) {
        options.logger?.warn(
          { skippedAuthors, selectedAuthor: quote.author, page: page.page },
          'skipped wikiquote authors with no usable quotes'
        );
      }

      options.logger?.info({ author: quote.author, page: page.page }, 'selected quote from rotating wikiquote author');

      return {
        quote,
        nextState: {
          ...options.state,
          rotationIndex: pageIndex + 1,
          usedQuoteIds: appendUsedQuoteId(options.state.usedQuoteIds, quote.id)
        }
      };
    }

    if (options.preview) {
      options.logger?.warn(
        { author: page.author, page: page.page, rotationIndex },
        'scheduled wikiquote author has no usable quotes'
      );
      return undefined;
    }

    skippedAuthors.push(page.author);
    options.logger?.warn(
      { author: page.author, page: page.page, rotationIndex },
      'wikiquote author has no usable quotes; trying next'
    );

    rotationIndex = pageIndex + 1;
  }

  return undefined;
}

function selectFromQuotePool(quotes: Quote[], state: BotState): { quote: Quote; nextState: BotState } | undefined {
  const quote = pickQuoteFromAuthorPool(quotes, state);
  if (!quote) {
    return undefined;
  }

  return {
    quote,
    nextState: {
      ...state,
      rotationIndex: state.rotationIndex + 1,
      usedQuoteIds: appendUsedQuoteId(state.usedQuoteIds, quote.id)
    }
  };
}

function pickQuoteFromAuthorPool(quotes: Quote[], state: BotState): Quote | undefined {
  if (quotes.length === 0) {
    return undefined;
  }

  const used = new Set(state.usedQuoteIds);
  const unused = quotes.filter((quote) => !used.has(quote.id));
  const pool = unused.length > 0 ? unused : quotes;
  const usedFromAuthor = quotes.filter((quote) => used.has(quote.id)).length;

  return pool[positiveModulo(usedFromAuthor, pool.length)];
}

function appendUsedQuoteId(ids: string[], id: string): string[] {
  return [...ids.filter((existing) => existing !== id), id].slice(-5000);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
