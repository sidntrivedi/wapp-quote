import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { z } from 'zod';
import { approvedWikiquotePages } from './approved-authors.js';

dotenv.config();

const envSchema = z.object({
  WHATSAPP_GROUP_JID: z.string().trim().optional(),
  QUOTE_SOURCE: z.enum(['wikiquote', 'local']).default('wikiquote'),
  WIKIQUOTE_LANGUAGE: z.enum(['hi', 'ur']).default('hi'),
  WIKIQUOTE_MODE: z.enum(['authors', 'any', 'pages']).default('pages'),
  WIKIQUOTE_CATEGORIES: z.string().trim().optional(),
  WIKIQUOTE_PAGES: z.string().trim().optional(),
  WIKIQUOTE_RANDOM_PAGE_LIMIT: z.coerce.number().int().min(1).max(50).default(30),
  QUOTE_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:00'),
  TZ: z.string().trim().min(1).default('Asia/Kolkata'),
  AUTH_METHOD: z.enum(['pairing', 'qr']).default('pairing'),
  PAIRING_PHONE_NUMBER: z.string().regex(/^\d+$/).optional(),
  DATA_DIR: z.string().trim().min(1).default('./data'),
  AUTH_DIR: z.string().trim().min(1).optional(),
  STATE_FILE: z.string().trim().min(1).optional(),
  RESET_AUTH_ON_START: z.coerce.boolean().default(false),
  RESET_AUTH_TOKEN: z.string().trim().optional(),
  AI_PROVIDER: z.enum(['none', 'ollama-cloud']).default('none'),
  OLLAMA_BASE_URL: z.string().url().default('https://ollama.com/api'),
  OLLAMA_MODEL: z.string().trim().min(1).default('gpt-oss:120b'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info')
});

export type AppConfig = {
  groupJid?: string;
  quoteSource: 'wikiquote' | 'local';
  wikiquoteLanguage: 'hi' | 'ur';
  wikiquoteMode: 'authors' | 'any' | 'pages';
  wikiquoteCategories: string[];
  wikiquotePages: Array<{ page: string; author: string }>;
  wikiquoteRandomPageLimit: number;
  quoteTime: string;
  timeZone: string;
  authMethod: 'pairing' | 'qr';
  pairingPhoneNumber?: string;
  dataDir: string;
  authDir: string;
  stateFile: string;
  resetAuthOnStart: boolean;
  resetAuthToken?: string;
  aiProvider: 'none' | 'ollama-cloud';
  ollamaBaseUrl: string;
  ollamaModel: string;
  aiTimeoutMs: number;
  aiTemperature: number;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const dataDir = path.resolve(parsed.DATA_DIR);

  return {
    groupJid: parsed.WHATSAPP_GROUP_JID,
    quoteSource: parsed.QUOTE_SOURCE,
    wikiquoteLanguage: parsed.WIKIQUOTE_LANGUAGE,
    wikiquoteMode: parsed.WIKIQUOTE_MODE,
    wikiquoteCategories: parseWikiquoteCategories(parsed.WIKIQUOTE_CATEGORIES),
    wikiquotePages: parseWikiquotePages(parsed.WIKIQUOTE_PAGES),
    wikiquoteRandomPageLimit: parsed.WIKIQUOTE_RANDOM_PAGE_LIMIT,
    quoteTime: parsed.QUOTE_TIME,
    timeZone: parsed.TZ,
    authMethod: parsed.AUTH_METHOD,
    pairingPhoneNumber: parsed.PAIRING_PHONE_NUMBER,
    dataDir,
    authDir: path.resolve(parsed.AUTH_DIR ?? path.join(dataDir, 'auth')),
    stateFile: path.resolve(parsed.STATE_FILE ?? path.join(dataDir, 'state.json')),
    resetAuthOnStart: parsed.RESET_AUTH_ON_START,
    resetAuthToken: parsed.RESET_AUTH_TOKEN,
    aiProvider: parsed.AI_PROVIDER,
    ollamaBaseUrl: parsed.OLLAMA_BASE_URL.replace(/\/$/, ''),
    ollamaModel: parsed.OLLAMA_MODEL,
    aiTimeoutMs: parsed.AI_TIMEOUT_MS,
    aiTemperature: parsed.AI_TEMPERATURE,
    logLevel: parsed.LOG_LEVEL
  };
}

function parseWikiquoteCategories(value: string | undefined): string[] {
  if (!value) {
    return ['लेखक', 'दार्शनिक', 'भारत के कवि'];
  }

  return value
    .split(',')
    .map((category) => category.trim().replace(/^श्रेणी:/, ''))
    .filter(Boolean);
}

function parseWikiquotePages(value: string | undefined): Array<{ page: string; author: string }> {
  if (!value) {
    return approvedWikiquotePages;
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [page, author = page] = entry.split('|').map((part) => part.trim());
      if (!page) {
        throw new Error(`Invalid WIKIQUOTE_PAGES entry: ${entry}`);
      }
      return { page, author };
    });
}

export function requireGroupJid(config: AppConfig): string {
  if (!config.groupJid) {
    throw new Error('WHATSAPP_GROUP_JID is required. Run `npm run dev -- list-groups`, then set it in .env.');
  }

  if (!config.groupJid.endsWith('@g.us')) {
    throw new Error(`WHATSAPP_GROUP_JID must look like a group JID ending with @g.us. Got: ${config.groupJid}`);
  }

  return config.groupJid;
}

export function requirePairingPhoneNumber(config: AppConfig): string {
  if (config.authMethod !== 'pairing') {
    throw new Error('Pairing phone number is only required when AUTH_METHOD=pairing.');
  }

  if (!config.pairingPhoneNumber) {
    throw new Error('PAIRING_PHONE_NUMBER is required for pairing. Use digits only, including country code.');
  }

  return config.pairingPhoneNumber;
}
