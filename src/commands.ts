import fs from 'node:fs/promises';
import process from 'node:process';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { requireGroupJid } from './config.js';
import { getQuoteForPreview } from './quotes.js';
import { selectQuote } from './quote-source.js';
import { runDailyQuote } from './quote-runner.js';
import { renderQuoteMessage } from './message.js';
import { localDateKey } from './date.js';
import { startDailySchedule } from './scheduler.js';
import { acquireServeLock, assertServeNotRunning, releaseServeLock } from './serve-lock.js';
import { StateStore } from './state-store.js';
import { enrichQuoteReflection } from './ai-reflection.js';
import type { Quote } from './types.js';
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

  startDailySchedule({
    quoteTime: options.config.quoteTime,
    timeZone: options.config.timeZone,
    logger: options.logger,
    catchUpEnabled: options.config.quoteCatchUp,
    hasSentToday: async () => {
      const state = await options.stateStore.load();
      const dateKey = localDateKey(new Date(), options.config.timeZone);
      return Boolean(state.sentDates[dateKey]);
    },
    task: async () => {
      await runScheduledDailyQuote({
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
}

async function runScheduledDailyQuote(options: {
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
      const result = await runDailyQuote({
        sender: options.sender,
        state,
        groupJid: options.groupJid,
        now: new Date(),
        timeZone: options.config.timeZone,
        selectQuote: (currentState) =>
          selectQuote({
            config: options.config,
            state: currentState,
            logger: options.logger
          }),
        renderMessage: (quote) => renderMessageWithAiReflection(quote, options.config, options.logger)
      });

      if (result.status === 'sent') {
        await options.stateStore.save(result.nextState);
        options.logger.info(
          { dateKey: result.dateKey, quoteId: result.quoteId, messageId: result.messageId, attempt },
          'daily quote sent'
        );
      } else {
        options.logger.info({ dateKey: result.dateKey, quoteId: result.quoteId, attempt }, 'daily quote already sent');
      }

      return;
    } catch (error) {
      const state = await options.stateStore.load();
      const dateKey = localDateKey(new Date(), options.config.timeZone);
      if (state.sentDates[dateKey]) {
        options.logger.warn({ error, attempt, dateKey }, 'daily quote already recorded for today; not retrying');
        return;
      }

      if (options.sender.isLoggedOut()) {
        options.logger.error({ error, attempt }, 'daily quote aborted; WhatsApp session logged out');
        throw error;
      }

      if (attempt === maxAttempts) {
        throw error;
      }

      options.logger.warn({ error, attempt, retryInMs: retryDelayMs }, 'daily quote attempt failed; retrying');
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
  const result = await runDailyQuote({
    sender: options.sender,
    state,
    groupJid,
    now: new Date(),
    timeZone: options.config.timeZone,
    selectQuote: (currentState) =>
      selectQuote({
        config: options.config,
        state: currentState,
        logger: options.logger
      }),
    renderMessage: (quote) => renderMessageWithAiReflection(quote, options.config, options.logger),
    force: true
  });

  if (result.status === 'sent') {
    await options.stateStore.save(result.nextState);
    options.logger.info({ dateKey: result.dateKey, quoteId: result.quoteId, messageId: result.messageId }, 'quote sent');
  }

  await options.sender.close();
}

async function preview(options: { config: AppConfig; logger: Logger; stateStore: StateStore }): Promise<void> {
  const state = await options.stateStore.load();
  const { quote } =
    options.config.quoteSource === 'local'
      ? { quote: getQuoteForPreview(state) }
      : await selectQuote({
          config: options.config,
          state,
          logger: options.logger
        });
  console.log(await renderMessageWithAiReflection(quote, options.config, options.logger));
}

async function renderMessageWithAiReflection(quote: Quote, config: AppConfig, logger: Logger): Promise<string> {
  const enrichedQuote = await enrichQuoteReflection({ quote, config, logger });
  return renderQuoteMessage(enrichedQuote);
}

function printHelp(): void {
  console.log(`Usage: npm run dev -- <command>

Commands:
  pair          Link WhatsApp as a device and persist auth in data/auth
  pair-qr       Link WhatsApp by scanning a terminal QR code
  reset-auth    Remove saved WhatsApp auth so pairing starts fresh
  list-groups   Print group names and JIDs
  preview       Print the next quote without sending
  send-now      Send the next quote immediately
  serve         Run the 06:00 daily scheduler
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
