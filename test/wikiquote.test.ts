import { describe, expect, it } from 'vitest';
import { extractQuotesFromWikitext, fetchRandomWikiquoteAuthorPages, fetchWikiquoteQuotes } from '../src/wikiquote.js';

describe('extractQuotesFromWikitext', () => {
  it('extracts safe bullet quotes with continuation lines', () => {
    const wikitext = `
'''कबीर''' कवि थे।

== दोहे ==
* धैर्य रखो रे मना, धीरे सब कुछ होय ।<br />
:माली सींचे सौ घड़ा, ऋतु आए फल होय ।

* सरकार और राजनीति पर यह एक टिप्पणी है।

* ''किं गंगाम्बुनि बिम्बितेऽम्बरमनौ चण्डालवाटीपयः ॥''

** यह कथन विचारों की शक्ति पर प्रकाश डालता है।

* दुःख में सुमिरन सब करे सुख में करे न कोय।

== कबीर दास के बारे में उक्तियाँ ==
* यह लेखक के बारे में है।
`;

    const quotes = extractQuotesFromWikitext(wikitext, 'कबीर', 'hi', 'कबीर');

    expect(quotes).toHaveLength(1);
    expect(quotes[0].text).toBe('धैर्य रखो रे मना, धीरे सब कुछ होय । माली सींचे सौ घड़ा, ऋतु आए फल होय ।');
    expect(quotes[0].author).toBe('कबीर');
    expect(quotes[0].source).toContain('hi.wikiquote.org');
  });
});

describe('fetchWikiquoteQuotes', () => {
  it('rejects topic pages when author mode samples random Wikiquote pages', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);

      if (href.includes('list=random')) {
        return new Response(
          JSON.stringify({
            query: {
              random: [{ title: 'अस्पृश्यता' }, { title: 'कबीर' }]
            }
          })
        );
      }

      if (href.includes('page=%E0%A4%85%E0%A4%B8%E0%A5%8D%E0%A4%AA%E0%A5%83%E0%A4%B6%E0%A5%8D%E0%A4%AF%E0%A4%A4%E0%A4%BE')) {
        return new Response(
          JSON.stringify({
            parse: {
              title: 'अस्पृश्यता',
              wikitext: {
                '*': `
== उक्तियाँ ==
* मन में आनन्द रखो, पर यह विषय पेज है।

[[श्रेणी:विषय]]
`
              }
            }
          })
        );
      }

      return new Response(
        JSON.stringify({
          parse: {
            title: 'कबीर',
            wikitext: {
              '*': `
'''कबीर''' संत और कवि थे।

== दोहे ==
* धैर्य रखो रे मना, धीरे सब कुछ होय ।

[[श्रेणी:भारत के कवि]]
`
            }
          }
        })
      );
    };

    const quotes = await fetchWikiquoteQuotes({
      language: 'hi',
      mode: 'authors',
      categories: [],
      pages: [],
      randomPageLimit: 2,
      fetchImpl
    });

    expect(quotes).toHaveLength(1);
    expect(quotes[0].author).toBe('कबीर');
  });
});

describe('fetchRandomWikiquoteAuthorPages', () => {
  it('fetches pages from configured author categories', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);

      if (href.includes('list=random')) {
        return new Response(
          JSON.stringify({
            query: {
              random: [{ title: 'हेलेन केलर' }]
            }
          })
        );
      }

      return new Response(
        JSON.stringify({
          query: {
            categorymembers: [
              { title: 'कबीर' },
              { title: 'रहीम' },
              { title: 'कबीर' }
            ]
          }
        })
      );
    };

    const pages = await fetchRandomWikiquoteAuthorPages({
      language: 'hi',
      categories: ['लेखक'],
      limit: 10,
      fetchImpl
    });

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.author).sort()).toEqual(['कबीर', 'रहीम', 'हेलेन केलर']);
  });
});
