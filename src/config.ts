import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanEnv = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  WHATSAPP_GROUP_JID: z.string().trim().optional(),
  GITA_API_BASE_URL: z.string().url().default('https://vedicscriptures.github.io'),
  GITA_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  GITA_HINDI_FIELD: z.string().trim().min(1).default('tej.ht'),
  GITA_VERSES_PER_DAY: z.coerce.number().int().min(1).max(10).default(2),
  GITA_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:00'),
  TZ: z.string().trim().min(1).default('Asia/Kolkata'),
  AUTH_METHOD: z.enum(['pairing', 'qr']).default('pairing'),
  PAIRING_PHONE_NUMBER: z.string().regex(/^\d+$/).optional(),
  DATA_DIR: z.string().trim().min(1).default('./data'),
  AUTH_DIR: z.string().trim().min(1).optional(),
  STATE_FILE: z.string().trim().min(1).optional(),
  RESET_AUTH_ON_START: booleanEnv.default('false'),
  RESET_AUTH_TOKEN: z.string().trim().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  GITA_CATCH_UP: booleanEnv.default('true'),
  HEALTH_WEBHOOK_ENABLED: booleanEnv.default('false'),
  HEALTH_WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HEALTH_WEBHOOK_TOKEN: z.string().trim().optional(),
  HEALTH_GROUP_JID: z.string().trim().optional(),
  HEALTH_STEP_GOAL: z.coerce.number().int().min(0).max(1000000).default(9000),
  HEALTH_SLEEP_GOAL_HOURS: z.coerce.number().min(0).max(24).default(7)
});

export type AppConfig = {
  groupJid?: string;
  gitaApiBaseUrl: string;
  gitaApiTimeoutMs: number;
  gitaHindiField: string;
  gitaVersesPerDay: number;
  gitaTime: string;
  timeZone: string;
  authMethod: 'pairing' | 'qr';
  pairingPhoneNumber?: string;
  dataDir: string;
  authDir: string;
  stateFile: string;
  resetAuthOnStart: boolean;
  resetAuthToken?: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  gitaCatchUp: boolean;
  healthWebhookEnabled: boolean;
  healthWebhookPort: number;
  healthWebhookToken?: string;
  healthGroupJids: string[];
  healthStepGoal: number;
  healthSleepGoalHours: number;
  healthStateFile: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const dataDir = path.resolve(parsed.DATA_DIR);

  return {
    groupJid: parsed.WHATSAPP_GROUP_JID,
    gitaApiBaseUrl: parsed.GITA_API_BASE_URL.replace(/\/$/, ''),
    gitaApiTimeoutMs: parsed.GITA_API_TIMEOUT_MS,
    gitaHindiField: parsed.GITA_HINDI_FIELD,
    gitaVersesPerDay: parsed.GITA_VERSES_PER_DAY,
    gitaTime: parsed.GITA_TIME,
    timeZone: parsed.TZ,
    authMethod: parsed.AUTH_METHOD,
    pairingPhoneNumber: parsed.PAIRING_PHONE_NUMBER,
    dataDir,
    authDir: path.resolve(parsed.AUTH_DIR ?? path.join(dataDir, 'auth')),
    stateFile: path.resolve(parsed.STATE_FILE ?? path.join(dataDir, 'state.json')),
    resetAuthOnStart: parsed.RESET_AUTH_ON_START,
    resetAuthToken: parsed.RESET_AUTH_TOKEN,
    logLevel: parsed.LOG_LEVEL,
    gitaCatchUp: parsed.GITA_CATCH_UP,
    healthWebhookEnabled: parsed.HEALTH_WEBHOOK_ENABLED,
    healthWebhookPort: parsed.HEALTH_WEBHOOK_PORT,
    healthWebhookToken: parsed.HEALTH_WEBHOOK_TOKEN,
    healthGroupJids: parseGroupJids(parsed.HEALTH_GROUP_JID),
    healthStepGoal: parsed.HEALTH_STEP_GOAL,
    healthSleepGoalHours: parsed.HEALTH_SLEEP_GOAL_HOURS,
    healthStateFile: path.resolve(parsed.STATE_FILE ? path.join(path.dirname(parsed.STATE_FILE), 'health.json') : path.join(dataDir, 'health.json'))
  };
}

function parseGroupJids(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((jid) => jid.trim())
    .filter(Boolean);
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

export function validateHealthEnvironment(config: AppConfig): void {
  if (!config.healthWebhookEnabled) {
    return;
  }

  if (!config.healthWebhookToken) {
    throw new Error('HEALTH_WEBHOOK_TOKEN is required when HEALTH_WEBHOOK_ENABLED=true. Set a long random secret.');
  }

  requireHealthGroupJids(config);
}

export function requireHealthGroupJids(config: AppConfig): string[] {
  const groupJids = config.healthGroupJids.length > 0 ? config.healthGroupJids : config.groupJid ? [config.groupJid] : [];

  if (groupJids.length === 0) {
    throw new Error('HEALTH_GROUP_JID (or WHATSAPP_GROUP_JID) is required when HEALTH_WEBHOOK_ENABLED=true.');
  }

  for (const groupJid of groupJids) {
    if (!groupJid.endsWith('@g.us')) {
      throw new Error(`Health target must be a group JID ending with @g.us. Got: ${groupJid}`);
    }
  }

  return groupJids;
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
