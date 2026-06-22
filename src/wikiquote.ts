import type { Quote } from './types.js';
import { isClassicalQuoteText } from './quote-filter.js';

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

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    try {
      if (pageIndex > 0) {
        await sleep(WIKIQUOTE_FETCH_DELAY_MS);
      }

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

  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetchImpl(url);

    if (response.status !== 429 || attempt === 2) {
      break;
    }

    await sleep(1000 * (attempt + 1));
  }

  if (!response!.ok) {
    throw new Error(`Wikiquote request failed: ${response!.status}`);
  }

  const data = (await response!.json()) as MediaWikiParseResponse;
  const wikitext = data.parse?.wikitext?.['*'];

  if (!wikitext) {
    throw new Error(data.error?.info ?? `Wikiquote page has no wikitext: ${options.page}`);
  }

  return wikitext;
}

const WIKIQUOTE_FETCH_DELAY_MS = 300;

type WikitextSection = {
  title: string;
  body: string;
};

export function extractQuotesFromWikitext(
  wikitext: string,
  author: string,
  language: 'hi' | 'ur',
  page: string
): Quote[] {
  const quotes: Quote[] = [];
  let extracting = false;

  for (const section of splitWikitextSections(wikitext)) {
    const sectionKind = classifySection(section.title);
    if (sectionKind === 'quote') {
      extracting = true;
    } else if (sectionKind === 'skip') {
      extracting = false;
    }

    if (!extracting) {
      continue;
    }

    extractBulletQuotes(section.body, quotes, author, language, page);
    extractPlainCouplets(section.body, quotes, author, language, page);
    extractHtmlBoldQuotes(section.body, quotes, author, language, page);
    extractQuotedStrings(section.body, quotes, author, language, page);
  }

  return dedupeQuotes(quotes);
}

function splitWikitextSections(wikitext: string): WikitextSection[] {
  const sections: WikitextSection[] = [];
  let current: WikitextSection | null = null;

  for (const rawLine of wikitext.split('\n')) {
    const line = rawLine.trim();

    if (/^=+[^=]+=+$/.test(line)) {
      if (current) {
        sections.push(current);
      }

      current = { title: line, body: '' };
      continue;
    }

    if (current) {
      current.body += `${rawLine}\n`;
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function extractBulletQuotes(
  body: string,
  quotes: Quote[],
  author: string,
  language: 'hi' | 'ur',
  page: string
): void {
  let currentBullet: string[] = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();

    if (/^#{1,6}\s/.test(line)) {
      continue;
    }

    if (/^[*#;]+\s/.test(line)) {
      if (currentBullet.length > 0) {
        pushQuote(quotes, currentBullet, author, language, page);
      }

      currentBullet = [line.replace(/^[*#;]+\s*/, '')];
      continue;
    }

    if (currentBullet.length > 0 && line.startsWith(':')) {
      currentBullet.push(line.replace(/^:\s*/, ''));
      continue;
    }

    if (currentBullet.length > 0) {
      pushQuote(quotes, currentBullet, author, language, page);
      currentBullet = [];
    }
  }

  if (currentBullet.length > 0) {
    pushQuote(quotes, currentBullet, author, language, page);
  }
}

function extractPlainCouplets(
  body: string,
  quotes: Quote[],
  author: string,
  language: 'hi' | 'ur',
  page: string
): void {
  let plainBuffer: string[] = [];

  const flushPlainBuffer = (): void => {
    if (plainBuffer.length === 0) {
      return;
    }

    pushQuote(quotes, [plainBuffer.join(' ')], author, language, page);
    plainBuffer = [];
  };

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('(') || line.startsWith('[[श्रेणी:') || line.startsWith('{{') || /^[*#;]/.test(line)) {
      continue;
    }

    appendPlainLine(plainBuffer, line);
    if (/[।॥]$/.test(normalizeWikiquoteText(line))) {
      flushPlainBuffer();
    }
  }

  flushPlainBuffer();
}

function extractHtmlBoldQuotes(
  body: string,
  quotes: Quote[],
  author: string,
  language: 'hi' | 'ur',
  page: string
): void {
  for (const match of body.matchAll(/<b[^>]*>([\s\S]*?)<\/b>/gi)) {
    pushQuote(quotes, [match[1]], author, language, page);
  }
}

function extractQuotedStrings(
  body: string,
  quotes: Quote[],
  author: string,
  language: 'hi' | 'ur',
  page: string
): void {
  for (const match of body.matchAll(/[“"]([^"”\n]{10,})["”]/g)) {
    pushQuote(quotes, [match[1]], author, language, page);
  }
}

function classifySection(headerLine: string): 'quote' | 'skip' | 'neutral' {
  const title = headerLine.replace(/^=+|\s*=+$/g, '').trim();

  if (
    /बारे में|बाह्य|सन्दर्भ|संदर्भ|बाह्य सूत्र|बाहरी|इन्हें|देखें|देखिए|स्रोत|विशेष|श्रेणियाँ|About|External|पर महापुरुष|के विचार$/i.test(
      title
    )
  ) {
    return 'skip';
  }

  const compact = title.replace(/\s+/g, '');
  if (
    /(दोहे|उद्धरण|उक्तियाँ|उक्ति|विचार|साखी|कथन|सूक्ति|सूक्तियाँ|चिंतन|उपदेश|श्लोक|पद|गीत|भजन|वचन|वाणी|अनमोल|प्रसिद्ध|कृति)/.test(
      compact
    )
  ) {
    return 'quote';
  }

  return 'neutral';
}

function appendPlainLine(buffer: string[], line: string): void {
  const parts = line
    .split(/<br\s*\/?>/gi)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.startsWith('(')) {
      continue;
    }

    buffer.push(part);
  }
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
    .replace(/^["“]|["”]$/g, '')
    .replace(/--.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCandidateQuote(text: string): boolean {
  if (text.startsWith('*') || text.startsWith(':')) {
    return false;
  }

  return isClassicalQuoteText(text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
