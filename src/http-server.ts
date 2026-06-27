import http from 'node:http';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { parseHealthPayload } from './health-schema.js';
import { renderHealthMessage, type HealthInsights } from './health-message.js';
import { HealthStore, markPosted, stepGoalStreak, trailingStepsAverage, upsertEntry } from './health-store.js';
import { generateHealthSummary } from './health-summary.js';
import type { HealthState } from './health-types.js';
import type { WhatsAppSender } from './types.js';

export type HealthWebhookConfig = Pick<
  AppConfig,
  | 'healthWebhookToken'
  | 'healthStepGoal'
  | 'timeZone'
  | 'aiProvider'
  | 'ollamaBaseUrl'
  | 'ollamaModel'
  | 'openaiModel'
  | 'aiTimeoutMs'
  | 'aiTemperature'
>;

export type HealthWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

const TRAILING_AVERAGE_DAYS = 7;

/**
 * Core webhook logic, decoupled from Node's http types for testability.
 * Validates the payload, persists it, posts to WhatsApp (unless already
 * posted today), and records the posted state.
 */
export async function processHealthWebhook(options: {
  rawBody: unknown;
  force: boolean;
  config: HealthWebhookConfig;
  logger: Logger;
  sender: Pick<WhatsAppSender, 'ensureConnected' | 'sendText'>;
  healthStore: HealthStore;
  groupJid: string;
  now?: Date;
}): Promise<HealthWebhookResult> {
  const now = options.now ?? new Date();
  let entry;
  try {
    entry = parseHealthPayload(options.rawBody, { timeZone: options.config.timeZone, now });
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: 400,
        body: {
          error: 'invalid_payload',
          issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
        }
      };
    }
    throw error;
  }

  const loaded = await options.healthStore.load();
  const stateWithEntry = upsertEntry(loaded, entry);
  await options.healthStore.save(stateWithEntry);

  const mergedEntry = stateWithEntry.entries[entry.date];
  const alreadyPosted = Boolean(mergedEntry.postedAt);

  if (alreadyPosted && !options.force) {
    options.logger.info({ date: entry.date }, 'health entry stored; already posted today, skipping send');
    return {
      status: 200,
      body: { status: 'stored', date: entry.date, posted: false, reason: 'already_posted' }
    };
  }

  const insights: HealthInsights = buildInsights(stateWithEntry, mergedEntry.date, options.config.healthStepGoal);

  const summary = await generateHealthSummary({
    entry: mergedEntry,
    insights,
    config: options.config,
    logger: options.logger
  });

  const message = renderHealthMessage({ entry: mergedEntry, insights, summary });

  await options.sender.ensureConnected();
  const sendResult = await sendWithRetry(() => options.sender.sendText(options.groupJid, message), 3);

  const postedState = markPosted(stateWithEntry, mergedEntry.date, now.toISOString(), sendResult.messageId);
  await options.healthStore.save(postedState);

  options.logger.info(
    { date: entry.date, messageId: sendResult.messageId, steps: mergedEntry.steps, streak: insights.streakDays },
    'health report posted to WhatsApp'
  );

  return {
    status: 200,
    body: { status: 'sent', date: entry.date, posted: true, messageId: sendResult.messageId }
  };
}

function buildInsights(state: HealthState, date: string, stepGoal: number): HealthInsights {
  const entry = state.entries[date];
  const metStepGoal = stepGoal > 0 && entry?.steps !== undefined && entry.steps >= stepGoal;
  return {
    stepGoal,
    metStepGoal,
    streakDays: stepGoalStreak(state, date, stepGoal),
    trailingAverageSteps: trailingStepsAverage(state, date, TRAILING_AVERAGE_DAYS)
  };
}

export type HealthServerHandle = {
  port: number;
  close: () => Promise<void>;
};

/**
 * Start the HTTP webhook server. Routes:
 *   GET  /healthz        → liveness probe
 *   POST /health         → ingest Apple Shortcuts payload (bearer auth)
 */
export async function startHealthServer(options: {
  port: number;
  config: HealthWebhookConfig;
  logger: Logger;
  sender: Pick<WhatsAppSender, 'ensureConnected' | 'sendText'>;
  healthStore: HealthStore;
  groupJid: string;
}): Promise<HealthServerHandle> {
  const server = http.createServer((req, res) => {
    void handleRequest(req, res, options).catch((error: unknown) => {
      options.logger.error({ err: error }, 'health webhook request failed');
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  options.logger.info({ port }, 'health webhook server listening');

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: {
    config: HealthWebhookConfig;
    logger: Logger;
    sender: Pick<WhatsAppSender, 'ensureConnected' | 'sendText'>;
    healthStore: HealthStore;
    groupJid: string;
  }
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/health') {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  if (!isAuthorized(req, options.config.healthWebhookToken ?? '')) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }

  const force = url.searchParams.get('force') === 'true';
  const result = await processHealthWebhook({
    rawBody,
    force,
    config: options.config,
    logger: options.logger,
    sender: options.sender,
    healthStore: options.healthStore,
    groupJid: options.groupJid
  });

  sendJson(res, result.status, result.body);
}

export function isAuthorized(
  req: Pick<http.IncomingMessage, 'headers'>,
  expectedToken: string
): boolean {
  if (!expectedToken) {
    return false;
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && timingSafeEqual(match[1].trim(), expectedToken)) {
      return true;
    }
  }

  const tokenHeader = req.headers['x-webhook-token'];
  if (typeof tokenHeader === 'string' && timingSafeEqual(tokenHeader.trim(), expectedToken)) {
    return true;
  }

  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function readJsonBody(req: http.IncomingMessage, maxBytes = 256 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error('payload too large');
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') {
    return {};
  }
  return JSON.parse(text);
}

function sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

async function sendWithRetry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}
