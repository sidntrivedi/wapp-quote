import type { Quote } from './types.js';
import { isMorningSuitableQuoteText } from './quote-filter.js';

type WikiquotePage = {
  page: string;
  author: string;
};

type MediaWikiParseResponse = {
  parse?: {
    title?: string;
    wikitext?: {
      '*': string;
    };
  };
  error?: {
    code: string;
    info: string;
  };
};

export async function fetchWikiquoteQuotes(options: {
  language: 'hi' | 'ur';
  mode: 'authors' | 'any' | 'pages';
  categories: string[];
  pages: WikiquotePage[];
  randomPageLimit: number;
  fetchImpl?: typeof fetch;
}): Promise<Quote[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const quotes: Quote[] = [];
  const pages =
    options.mode === 'pages' && options.pages.length > 0
      ? options.pages
      : options.mode === 'authors'
        ? await fetchRandomWikiquoteAuthorPages({
            language: options.language,
            categories: options.categories,
            limit: options.randomPageLimit,
            fetchImpl
          })
      : await fetchRandomWikiquotePages({
          language: options.language,
          limit: options.randomPageLimit,
          fetchImpl
        });

  for (const page of pages) {
    try {
      if (options.mode === 'authors' && isDisallowedAuthorPageTitle(page.page)) {
        continue;
      }

      const wikitext = await fetchWikiquoteWikitext({
        language: options.language,
        page: page.page,
        fetchImpl
      });

      if (options.mode === 'authors' && !isLikelyAuthorPage(wikitext, page.page)) {
        continue;
      }

      quotes.push(...extractQuotesFromWikitext(wikitext, page.author, options.language, page.page));
    } catch {
      // A missing or oddly formatted page should not take down the morning send.
    }
  }

  return dedupeQuotes(quotes);
}

export async function fetchRandomWikiquoteAuthorPages(options: {
  language: 'hi' | 'ur';
  categories: string[];
  limit: number;
  fetchImpl?: typeof fetch;
}): Promise<WikiquotePage[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const allPages: WikiquotePage[] = [];

  for (const category of options.categories) {
    const url = new URL(`https://${options.language}.wikiquote.org/w/api.php`);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'categorymembers');
    url.searchParams.set('cmtitle', `श्रेणी:${category}`);
    url.searchParams.set('cmnamespace', '0');
    url.searchParams.set('cmlimit', '50');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const response = await fetchImpl(url);

    if (!response.ok) {
      continue;
    }

    const data = (await response.json()) as {
      query?: {
        categorymembers?: Array<{ title: string }>;
      };
    };

    allPages.push(...(data.query?.categorymembers ?? []).map((page) => ({ page: page.title, author: page.title })));
  }

  const randomPages = await fetchRandomWikiquotePages({
    language: options.language,
    limit: Math.min(options.limit * 3, 50),
    fetchImpl
  });

  const deduped = dedupePages([...allPages, ...randomPages]);
  return shuffle(deduped).slice(0, options.limit);
}

export async function fetchRandomWikiquotePages(options: {
  language: 'hi' | 'ur';
  limit: number;
  fetchImpl?: typeof fetch;
}): Promise<WikiquotePage[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://${options.language}.wikiquote.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'random');
  url.searchParams.set('rnnamespace', '0');
  url.searchParams.set('rnlimit', String(options.limit));
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Wikiquote random request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    query?: {
      random?: Array<{ title: string }>;
    };
  };

  return (data.query?.random ?? []).map((page) => ({ page: page.title, author: page.title }));
}

export async function fetchWikiquoteWikitext(options: {
  language: 'hi' | 'ur';
  page: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://${options.language}.wikiquote.org/w/api.php`);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', options.page);
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Wikiquote request failed: ${response.status}`);
  }

  const data = (await response.json()) as MediaWikiParseResponse;
  const wikitext = data.parse?.wikitext?.['*'];

  if (!wikitext) {
    throw new Error(data.error?.info ?? `Wikiquote page has no wikitext: ${options.page}`);
  }

  return wikitext;
}

export function extractQuotesFromWikitext(
  wikitext: string,
  author: string,
  language: 'hi' | 'ur',
  page: string
): Quote[] {
  const quotes: Quote[] = [];
  const lines = wikitext.split('\n');
  let current: string[] = [];
  let inAuthorQuotesSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('==')) {
      if (current.length > 0) {
        pushQuote(quotes, current, author, language, page);
        current = [];
      }

      inAuthorQuotesSection = !/बारे|बाह्य|सन्दर्भ|संदर्भ|External|About/i.test(line);
      continue;
    }

    if (!inAuthorQuotesSection) {
      continue;
    }

    if (line.startsWith('*')) {
      if (current.length > 0) {
        pushQuote(quotes, current, author, language, page);
      }
      current = [line.replace(/^\*\s*/, '')];
      continue;
    }

    if (current.length > 0 && line.startsWith(':')) {
      current.push(line.replace(/^:\s*/, ''));
    }
  }

  if (current.length > 0) {
    pushQuote(quotes, current, author, language, page);
  }

  return quotes;
}

function pushQuote(quotes: Quote[], lines: string[], author: string, language: 'hi' | 'ur', page: string): void {
  const text = normalizeWikiquoteText(lines.join(' '));

  if (!isCandidateQuote(text)) {
    return;
  }

  quotes.push({
    id: `wikiquote:${language}:${page}:${stableHash(`${author}:${text}`)}`,
    text,
    author,
    language,
    mood: 'wisdom',
    reflection: 'आज इस पंक्ति को मन में रखकर दिन की शुरुआत शांत और अच्छे भाव से करें।',
    source: `https://${language}.wikiquote.org/wiki/${encodeURIComponent(page)}`
  });
}

function normalizeWikiquoteText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{cite[^}]+\}\}/gi, ' ')
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/\[\[चित्र:[^\]]+\]\]/gi, ' ')
    .replace(/\[\[File:[^\]]+\]\]/gi, ' ')
    .replace(/'{2,}/g, '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[[^\]\s]+ ([^\]]+)\]/g, '$1')
    .replace(/--.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCandidateQuote(text: string): boolean {
  if (text.length < 24 || text.length > 160) {
    return false;
  }

  if (text.startsWith('*') || text.startsWith(':')) {
    return false;
  }

  if (!/[ऀ-ॿ]/.test(text)) {
    return false;
  }

  if (/[{}[\]<>]/.test(text)) {
    return false;
  }

  if (/ISBN|http|श्रेणी|विकिपीडिया|cite|स्रोत:|यह कथन|बताता है|प्रकाश डालता है/i.test(text)) {
    return false;
  }

  return isMorningSuitableQuoteText(text);
}

function isLikelyAuthorPage(wikitext: string, title: string): boolean {
  if (isDisallowedAuthorPageTitle(title)) {
    return false;
  }

  const sample = normalizeWikiquoteText(wikitext.slice(0, 2500));
  const categories = Array.from(wikitext.matchAll(/\[\[श्रेणी:([^\]]+)\]\]/g)).map((match) => match[1]).join(' ');
  const haystack = `${sample} ${categories}`;

  if (/विषय|सूक्ति|कहावत|लोकोक्ति|अवधारणा|विचारधारा|त्योहार|ऋतु|ग्रन्थ|ग्रंथ|पुस्तक|महाकाव्य/i.test(categories)) {
    return false;
  }

  return /कवि|लेखक|दार्शनिक|वैज्ञानिक|चिंतक|साहित्यकार|उपन्यासकार|नाटककार|समाजसेवी|संत|गुरु|शिक्षक|उद्यमी|अभिनेता|अभिनेत्री|जन्मे लोग|में जन्म|जन्म|निधन/i.test(
    haystack
  );
}

function isDisallowedAuthorPageTitle(title: string): boolean {
  const normalized = title.trim().replace(/\s+/g, ' ');
  const disallowedTitles = new Set([
    'अस्पृश्यता',
    'नीति',
    'यज्ञ',
    'वसन्त',
    'वसंत',
    'जीवन',
    'मृत्यु',
    'प्रेम',
    'सत्य',
    'शांति',
    'शान्ति',
    'धर्म',
    'समय',
    'शिक्षा',
    'राजनीति',
    'युद्ध',
    'भारत',
    'स्वतंत्रता'
  ]);

  if (disallowedTitles.has(normalized)) {
    return true;
  }

  return /^(विषय|सूक्ति|कहावत|लोकोक्ति|उक्ति|कथन):/.test(normalized);
}

function dedupeQuotes(quotes: Quote[]): Quote[] {
  const seen = new Set<string>();
  const result: Quote[] = [];

  for (const quote of quotes) {
    const key = `${quote.author}:${quote.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(quote);
    }
  }

  return result;
}

function dedupePages(pages: WikiquotePage[]): WikiquotePage[] {
  const seen = new Set<string>();
  const result: WikiquotePage[] = [];

  for (const page of pages) {
    if (!seen.has(page.page)) {
      seen.add(page.page);
      result.push(page);
    }
  }

  return result;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function stableHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}
