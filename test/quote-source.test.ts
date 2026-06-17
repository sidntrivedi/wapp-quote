import { describe, expect, it } from 'vitest';
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
});
