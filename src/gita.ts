import type { AppConfig } from './config.js';
import type { BotState, GitaVerse } from './types.js';

export const GITA_VERSE_COUNTS = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78] as const;
export const TOTAL_GITA_VERSES = GITA_VERSE_COUNTS.reduce((sum, count) => sum + count, 0);

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const SANSKRIT_KEYS = ['slok', 'shloka', 'sanskrit', 'text', 'verseText'];
const NON_MEANING_KEYS = [...SANSKRIT_KEYS, 'transliteration', 'author', 'translator', 'name', 'language'];

export class InvalidGitaResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGitaResponseError';
  }
}

type GitaApiConfig = Pick<AppConfig, 'gitaApiBaseUrl' | 'gitaApiTimeoutMs' | 'gitaHindiField'>;

export type GitaApiOptions = {
  baseUrl: string;
  timeoutMs: number;
  hindiField: string;
  fetchImpl?: typeof fetch;
};

export async function selectNextGitaVerse(options: {
  config: GitaApiConfig;
  state: BotState;
  fetchImpl?: typeof fetch;
}): Promise<{ verse: GitaVerse; nextState: BotState }> {
  const cursor = normalizeCursor(options.state.gitaCursor);
  const { chapter, verse } = gitaPositionFromIndex(cursor);
  const selectedVerse = await fetchGitaVerse(chapter, verse, {
    baseUrl: options.config.gitaApiBaseUrl,
    timeoutMs: options.config.gitaApiTimeoutMs,
    hindiField: options.config.gitaHindiField,
    fetchImpl: options.fetchImpl
  });

  return {
    verse: selectedVerse,
    nextState: {
      ...options.state,
      gitaCursor: (cursor + 1) % TOTAL_GITA_VERSES
    }
  };
}

export async function fetchGitaVerse(chapter: number, verse: number, options: GitaApiOptions): Promise<GitaVerse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/slok/${chapter}/${verse}/`, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new InvalidGitaResponseError(`Gita API returned HTTP ${response.status}`);
    }

    const payload = await parseJsonResponse(response, chapter, verse);
    return normalizeGitaVerse(payload, { chapter, verse, preferredHindiField: options.hindiField });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response: Response, chapter: number, verse: number): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  try {
    return JSON.parse(body) as unknown;
  } catch {
    const preview = body.slice(0, 80).replace(/\s+/g, ' ').trim();
    throw new InvalidGitaResponseError(
      `Gita API did not return JSON for ${chapter}.${verse} (content-type: ${contentType || 'unknown'}, preview: ${preview})`
    );
  }
}

export function normalizeGitaVerse(
  payload: unknown,
  options: { chapter: number; verse: number; preferredHindiField: string }
): GitaVerse {
  if (!isRecord(payload)) {
    throw new InvalidGitaResponseError('Gita API response is not an object');
  }

  const chapter = readNumber(payload, ['chapter', 'chapter_number', 'chapterNumber', 'chap', 'c']);
  const verse = readNumber(payload, ['verse', 'verse_number', 'verseNumber', 'slok_number', 'slokNumber', 'v']);

  if (chapter !== options.chapter || verse !== options.verse) {
    throw new InvalidGitaResponseError(`Gita API response verse mismatch: expected ${options.chapter}.${options.verse}`);
  }

  const sanskrit = readFirstString(payload, SANSKRIT_KEYS);
  if (!sanskrit) {
    throw new InvalidGitaResponseError('Gita API response is missing Sanskrit shloka text');
  }

  const preferredHindi = readPath(payload, options.preferredHindiField);
  const preferredHindiString = typeof preferredHindi === 'string' ? cleanText(preferredHindi) : '';
  const hindiMeaning = isValidHindiMeaning(preferredHindiString) ? preferredHindiString : findFirstHindiMeaning(payload);

  if (!hindiMeaning) {
    throw new InvalidGitaResponseError('Gita API response is missing a valid Hindi meaning');
  }

  return {
    kind: 'gita',
    id: gitaId(options.chapter, options.verse),
    chapter: options.chapter,
    verse: options.verse,
    label: gitaLabel(options.chapter, options.verse),
    sanskrit,
    hindiMeaning,
    ...(isValidHindiMeaning(preferredHindiString) ? { sourceLabel: options.preferredHindiField } : {})
  };
}

export function gitaPositionFromIndex(index: number): { chapter: number; verse: number } {
  let remaining = normalizeCursor(index);

  for (let chapterIndex = 0; chapterIndex < GITA_VERSE_COUNTS.length; chapterIndex += 1) {
    const count = GITA_VERSE_COUNTS[chapterIndex];
    if (remaining < count) {
      return { chapter: chapterIndex + 1, verse: remaining + 1 };
    }
    remaining -= count;
  }

  return { chapter: 1, verse: 1 };
}

export function gitaIndexFromPosition(chapter: number, verse: number): number {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > GITA_VERSE_COUNTS.length) {
    throw new Error(`Invalid Gita chapter: ${chapter}`);
  }

  const verseCount = GITA_VERSE_COUNTS[chapter - 1];
  if (!Number.isInteger(verse) || verse < 1 || verse > verseCount) {
    throw new Error(`Invalid Gita verse: ${chapter}.${verse}`);
  }

  return GITA_VERSE_COUNTS.slice(0, chapter - 1).reduce((sum, count) => sum + count, 0) + verse - 1;
}

function normalizeCursor(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value % TOTAL_GITA_VERSES;
}

function gitaId(chapter: number, verse: number): string {
  return `gita-${String(chapter).padStart(2, '0')}-${String(verse).padStart(3, '0')}`;
}

function gitaLabel(chapter: number, verse: number): string {
  return `भगवद्गीता ${chapter}.${verse}`;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return Number(value);
    }
  }

  return undefined;
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const cleaned = cleanText(value);
      if (cleaned) {
        return cleaned;
      }
    }
  }

  return '';
}

function readPath(record: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, record);
}

function findFirstHindiMeaning(value: unknown): string {
  if (typeof value === 'string') {
    const cleaned = cleanText(value);
    return isValidHindiMeaning(cleaned) ? cleaned : '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstHindiMeaning(item);
      if (match) {
        return match;
      }
    }
    return '';
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (NON_MEANING_KEYS.includes(key)) {
        continue;
      }
      const match = findFirstHindiMeaning(child);
      if (match) {
        return match;
      }
    }
  }

  return '';
}

function isValidHindiMeaning(value: string): boolean {
  return value.length > 0 && DEVANAGARI_RE.test(value);
}

function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
