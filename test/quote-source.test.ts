import { describe, expect, it, vi } from 'vitest';
import { selectQuote } from '../src/quote-source.js';
import type { BotState } from '../src/types.js';

const kabirWikitext = `
'''कबीर''' कवि थे।

== दोहे ==
* धैर्य और प्रेम से जीवन सुंदर बनता है।
* ज्ञान और सत्य से मन में रोशनी आती है।
* हिम्मत और सेवा से जीवन सफल होता है।
`;

const rahimWikitext = `
'''रहीम''' कवि थे।

== दोहे ==
* प्रेम और दया से मन में शांति रहती है।
`;

function wikiquoteResponse(title: string, wikitext: string): Response {
  return new Response(
    JSON.stringify({
      parse: {
        title,
        wikitext: { '*': wikitext }
      }
    })
  );
}

describe('selectQuote', () => {
  it('rotates through approved Wikiquote authors by rotationIndex', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      const isKabir = href.includes('page=%E0%A4%95%E0%A4%AC%E0%A5%80%E0%A4%B0');
      return wikiquoteResponse(isKabir ? 'कबीर' : 'रहीम', isKabir ? kabirWikitext : rahimWikitext);
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
    expect(result.nextState.rotationIndex).toBe(2);
  });

  it('skips empty author pages when sending and tries the next approved author', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      const isKabir = href.includes('page=%E0%A4%95%E0%A4%AC%E0%A5%80%E0%A4%B0');

      if (isKabir) {
        return wikiquoteResponse(
          'कबीर',
          `
== परिचय ==
यह पृष्ठ केवल जीवनी विवरण है।
`
        );
      }

      return wikiquoteResponse('रहीम', rahimWikitext);
    };

    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };

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
    expect(result.nextState.rotationIndex).toBe(2);
  });

  it('does not skip ahead to a later author in preview mode', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      const isKabir = href.includes('page=%E0%A4%95%E0%A4%AC%E0%A5%80%E0%A4%B0');

      if (isKabir) {
        return wikiquoteResponse(
          'कबीर',
          `
== परिचय ==
यह पृष्ठ केवल जीवनी विवरण है।
`
        );
      }

      return wikiquoteResponse('रहीम', rahimWikitext);
    };

    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };
    const logger = { warn: vi.fn() };

    await expect(
      selectQuote({
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
        logger: logger as never,
        fetchImpl,
        preview: true
      })
    ).rejects.toThrow(/कबीर/);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'कबीर', rotationIndex: 0 }),
      'scheduled wikiquote author has no usable quotes'
    );
  });

  it('stops after one full author cycle when every page is empty', async () => {
    const fetchImpl = async () =>
      wikiquoteResponse(
        'कबीर',
        `
== परिचय ==
यह पृष्ठ केवल जीवनी विवरण है।
`
      );

    const state: BotState = { rotationIndex: 0, usedQuoteIds: [], sentDates: {} };
    const logger = { warn: vi.fn(), info: vi.fn() };
    let fetchCount = 0;

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
      logger: logger as never,
      fetchImpl: async (...args) => {
        fetchCount += 1;
        return fetchImpl(...args);
      }
    });

    expect(fetchCount).toBe(2);
    expect(result.quote.id).toBeTruthy();
    expect(logger.warn).toHaveBeenCalledWith('wikiquote author rotation found no usable quotes; falling back to local bank');
  });

  it('rotates within the same author when revisiting their quotes', async () => {
    const fetchImpl = async () => wikiquoteResponse('कबीर', kabirWikitext);
    const first = await selectQuote({
      config: {
        quoteSource: 'wikiquote',
        wikiquoteLanguage: 'hi',
        wikiquoteMode: 'pages',
        wikiquoteCategories: [],
        wikiquotePages: [{ page: 'कबीर', author: 'कबीर' }],
        wikiquoteRandomPageLimit: 1
      },
      state: { rotationIndex: 0, usedQuoteIds: [], sentDates: {} },
      fetchImpl
    });

    const second = await selectQuote({
      config: {
        quoteSource: 'wikiquote',
        wikiquoteLanguage: 'hi',
        wikiquoteMode: 'pages',
        wikiquoteCategories: [],
        wikiquotePages: [{ page: 'कबीर', author: 'कबीर' }],
        wikiquoteRandomPageLimit: 1
      },
      state: {
        rotationIndex: 52,
        usedQuoteIds: [first.quote.id],
        sentDates: {}
      },
      fetchImpl
    });

    expect(second.quote.author).toBe('कबीर');
    expect(second.quote.id).not.toBe(first.quote.id);
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
      wikiquoteResponse(
        'कबीर',
        `
== परिचय ==
यह पृष्ठ केवल जीवनी विवरण है।
`
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
    expect(logger.warn).toHaveBeenCalledWith('wikiquote author rotation found no usable quotes; falling back to local bank');
  });
});
