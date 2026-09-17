import fs from 'node:fs/promises';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { requireGroupJid, requireHealthGroupJids } from './config.js';
import { localDateKey } from './date.js';
import { selectNextGitaVerses } from './gita.js';
import { runDailyGita } from './gita-runner.js';
import { HealthStore } from './health-store.js';
import { startHealthServer, type HealthServerHandle } from './http-server.js';
import { renderGitaMessage } from './message.js';
import { startDailySchedule } from './scheduler.js';
import { acquireServeLock, assertServeNotRunning, releaseServeLock } from './serve-lock.js';
import { StateStore } from './state-store.js';
import type { WhatsAppSender } from './types.js';

export type Command = 'serve' | 'pair' | 'pair-qr' | 'reset-auth' | 'list-groups' | 'send-now' | 'preview' | 'help';

export async function runCommand(options: {
  command: Command;
  config: AppConfig;
  logger: Logger;
  sender: WhatsAppSender;
  stateStore: StateStore;
}): Promise<void> {
  switch (options.command) {
    case 'serve':
      await serve(options);
      return;
    case 'pair':
      await pair(options);
      return;
    case 'pair-qr':
      await pair(options);
      return;
    case 'reset-auth':
      await resetAuth(options);
      return;
    case 'list-groups':
      await listGroups({ config: options.config, sender: options.sender });
      return;
    case 'send-now':
      await sendNow(options);
      return;
    case 'preview':
      await preview(options);
      return;
    case 'help':
      printHelp();
      return;
  }
}

async function serve(options: {
  config: AppConfig;
  logger: Logger;
  sender: WhatsAppSender;
  stateStore: StateStore;
}): Promise<void> {
  await acquireServeLock(options.config.dataDir);

  const groupJid = requireGroupJid(options.config);
  await options.sender.connect();

  let healthServer: HealthServerHandle | undefined;
  if (options.config.healthWebhookEnabled) {
    healthServer = await startHealthServer({
      port: options.config.healthWebhookPort,
      config: options.config,
      logger: options.logger,
      sender: options.sender,
      healthStore: new HealthStore(options.config.healthStateFile),
      groupJids: requireHealthGroupJids(options.config)
    });
  }

  startDailySchedule({
    scheduleTime: options.config.gitaTime,
    timeZone: options.config.timeZone,
    logger: options.logger,
    catchUpEnabled: options.config.gitaCatchUp,
    hasSentToday: async () => {
      const state = await options.stateStore.load();
      const dateKey = localDateKey(new Date(), options.config.timeZone);
      return Boolean(state.sentDates[dateKey]);
    },
    task: async () => {
      await runScheduledDailyGita({
        config: options.config,
        logger: options.logger,
        sender: options.sender,
        stateStore: options.stateStore,
        groupJid
      });
    }
  });

  options.logger.info('bot is running');
  await waitForShutdown(options.config.dataDir);

  if (healthServer) {
    await healthServer.close().catch((error: unknown) => {
      options.logger.warn({ err: error }, 'failed to close health webhook server');
    });
  }
}

async function runScheduledDailyGita(options: {
  config: AppConfig;
  logger: Logger;
  sender: WhatsAppSender;
  stateStore: StateStore;
  groupJid: string;
}): Promise<void> {
  const maxAttempts = 3;
  const retryDelayMs = 5 * 60 * 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await options.sender.ensureConnected();
      const state = await options.stateStore.load();
      const result = await runDailyGita({
        sender: options.sender,
        state,
        groupJid: options.groupJid,
        now: new Date(),
        timeZone: options.config.timeZone,
        config: options.config
      });

      if (result.status === 'sent') {
        await options.stateStore.save(result.nextState);
        options.logger.info(
          { dateKey: result.dateKey, verseIds: result.verseIds, messageId: result.messageId, attempt },
          'daily Gita message sent'
        );
      } else {
        options.logger.info({ dateKey: result.dateKey, verseIds: result.verseIds, attempt }, 'daily Gita message already sent');
      }

      return;
    } catch (error) {
      const state = await options.stateStore.load();
      const dateKey = localDateKey(new Date(), options.config.timeZone);
      if (state.sentDates[dateKey]) {
        options.logger.warn({ error, attempt, dateKey }, 'daily Gita message already recorded for today; not retrying');
        return;
      }

      if (options.sender.isLoggedOut()) {
        options.logger.error({ error, attempt }, 'daily Gita message aborted; WhatsApp session logged out');
        throw error;
      }

      if (attempt === maxAttempts) {
        throw error;
      }

      options.logger.warn({ error, attempt, retryInMs: retryDelayMs }, 'daily Gita message attempt failed; retrying');
      await sleep(retryDelayMs);
    }
  }
}

async function pair(options: { config: AppConfig; sender: WhatsAppSender; logger: Logger }): Promise<void> {
  await resetAuth(options);
  await options.sender.connect();
  options.logger.info('pairing complete; keeping the process alive for 30 seconds to save credentials');
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  await options.sender.close();
}

async function resetAuth(options: { config: AppConfig; logger: Logger }): Promise<void> {
  await fs.rm(options.config.authDir, { recursive: true, force: true });
  options.logger.info({ authDir: options.config.authDir }, 'removed WhatsApp auth session');
}

async function listGroups(options: { config: AppConfig; sender: WhatsAppSender }): Promise<void> {
  await assertServeNotRunning(options.config.dataDir);
  await options.sender.connect();
  const groups = await options.sender.listGroups();

  for (const group of groups) {
    console.log(`${group.subject}\n  ${group.jid}\n  participants: ${group.participants}`);
  }

  await options.sender.close();
}

async function sendNow(options: {
  config: AppConfig;
  logger: Logger;
  sender: WhatsAppSender;
  stateStore: StateStore;
}): Promise<void> {
  await assertServeNotRunning(options.config.dataDir);
  const groupJid = requireGroupJid(options.config);
  await options.sender.connect();

  const state = await options.stateStore.load();
  const result = await runDailyGita({
    sender: options.sender,
    state,
    groupJid,
    now: new Date(),
    timeZone: options.config.timeZone,
    config: options.config,
    force: true
  });

  if (result.status === 'sent') {
    await options.stateStore.save(result.nextState);
    options.logger.info({ dateKey: result.dateKey, verseIds: result.verseIds, messageId: result.messageId }, 'Gita message sent');
  }

  await options.sender.close();
}

async function preview(options: { config: AppConfig; stateStore: StateStore }): Promise<void> {
  const state = await options.stateStore.load();
  const { batch } = await selectNextGitaVerses({
    config: options.config,
    state
  });
  console.log(renderGitaMessage(batch));
}

function printHelp(): void {
  console.log(`Usage: npm run dev -- <command>

Commands:
  pair          Link WhatsApp as a device and persist auth in data/auth
  pair-qr       Link WhatsApp by scanning a terminal QR code
  reset-auth    Remove saved WhatsApp auth so pairing starts fresh
  list-groups   Print group names and JIDs
  preview       Print the next Bhagavad Gita shlokas without sending
  send-now      Send the next Bhagavad Gita shlokas immediately
  serve         Run the daily scheduler
  help          Show this help
`);
}

function waitForShutdown(dataDir: string): Promise<void> {
  return new Promise((resolve) => {
    const shutdown = () => {
      void releaseServeLock(dataDir).finally(resolve);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
