import { describe, expect, it, vi } from 'vitest';
import { selectQuote } from '../src/quote-source.js';
import type { BotState } from '../src/types.js';

describe('selectQuote', () => {
  it('interleaves Wikiquote candidates by author', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      const isKabir = href.includes('page=%E0%A4%95%E0%A4%AC%E0%A5%80%E0%A4%B0');

      return new Response(
        JSON.stringify({
          parse: {
            title: isKabir ? 'कबीर' : 'रहीम',
            wikitext: {
              '*': isKabir
                ? `
'''कबीर''' कवि थे।

== दोहे ==
* धैर्य और प्रेम से जीवन सुंदर बनता है।
* ज्ञान और सत्य से मन में रोशनी आती है।
* हिम्मत और सेवा से जीवन सफल होता है।
`
                : `
'''रहीम''' कवि थे।

== दोहे ==
* प्रेम और दया से मन में शांति रहती है।
`
            }
          }
        })
      );
    };
    const state: BotState = { rotationIndex: 1, usedQuoteIds: [], sentDates: {} };

    const result = await selectQuote({
      config: {
        quoteSource: 'wikiquote',
        wikiquoteLanguage: 'hi',
        wikiquoteMode: 'pages',
        wikiquoteCategories: [],
        wikiquotePages: [
          { page: 'कबीर', author: 'कबीर' },
          { page: 'रहीम', author: 'रहीम' }
        ],
        wikiquoteRandomPageLimit: 2
      },
      state,
      fetchImpl
    });

    expect(result.quote.author).toBe('रहीम');
  });

  it('falls back to the local bank when wikiquote fetch fails', async () => {
    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };
    const logger = { warn: vi.fn() };

    const result = await selectQuote({
      config: {
        quoteSource: 'wikiquote',
        wikiquoteLanguage: 'hi',
        wikiquoteMode: 'pages',
        wikiquoteCategories: [],
        wikiquotePages: [{ page: 'कबीर', author: 'कबीर' }],
        wikiquoteRandomPageLimit: 1
      },
      state,
      logger: logger as never,
      fetchImpl: async () => {
        throw new Error('network down');
      }
    });

    expect(result.quote.id).toBeTruthy();
    expect(result.nextState.usedQuoteIds).toContain(result.quote.id);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('uses the local bank directly when quote source is local', async () => {
    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };

    const result = await selectQuote({
      config: {
        quoteSource: 'local',
        wikiquoteLanguage: 'hi',
        wikiquoteMode: 'pages',
        wikiquoteCategories: [],
        wikiquotePages: [],
        wikiquoteRandomPageLimit: 1
      },
      state
    });

    expect(result.quote.id).toBeTruthy();
    expect(result.nextState.usedQuoteIds).toContain(result.quote.id);
  });

  it('falls back when wikiquote returns no usable quotes', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          parse: {
            title: 'कबीर',
            wikitext: {
              '*': `
== परिचय ==
यह पृष्ठ केवल जीवनी विवरण है।
`
            }
          }
        })
      );

    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };
    const logger = { warn: vi.fn() };

    const result = await selectQuote({
      config: {
        quoteSource: 'wikiquote',
        wikiquoteLanguage: 'hi',
        wikiquoteMode: 'pages',
        wikiquoteCategories: [],
        wikiquotePages: [{ page: 'कबीर', author: 'कबीर' }],
        wikiquoteRandomPageLimit: 1
      },
      state,
      logger: logger as never,
      fetchImpl
    });

    expect(result.quote.id).toBeTruthy();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 0 }),
      'wikiquote returned no unused safe quotes; falling back to local bank'
    );
  });
});
