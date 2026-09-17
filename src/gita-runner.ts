import type { AppConfig } from './config.js';
import { localDateKey } from './date.js';
import { selectNextGitaVerses } from './gita.js';
import { renderGitaMessage } from './message.js';
import type { BotState, GitaVerseBatch, WhatsAppSender } from './types.js';

type RunDailyGitaOptions = {
  sender: Pick<WhatsAppSender, 'sendText'>;
  state: BotState;
  groupJid: string;
  now: Date;
  timeZone: string;
  config: Pick<AppConfig, 'gitaApiBaseUrl' | 'gitaApiTimeoutMs' | 'gitaHindiField' | 'gitaVersesPerDay'>;
  fetchImpl?: typeof fetch;
  selectVerses?: (state: BotState) => Promise<{ batch: GitaVerseBatch; nextState: BotState }> | { batch: GitaVerseBatch; nextState: BotState };
  renderMessage?: (batch: GitaVerseBatch) => Promise<string> | string;
  force?: boolean;
};

export type RunDailyGitaResult =
  | { status: 'skipped'; dateKey: string; verseIds: string[] }
  | { status: 'sent'; dateKey: string; verseIds: string[]; messageId?: string; nextState: BotState };

export async function runDailyGita(options: RunDailyGitaOptions): Promise<RunDailyGitaResult> {
  const dateKey = localDateKey(options.now, options.timeZone);
  const existing = options.state.sentDates[dateKey];

  if (existing && !options.force) {
    return { status: 'skipped', dateKey, verseIds: existing.verseIds };
  }

  const { batch, nextState } = await selectVerses(options);
  const message = await renderMessage(options, batch);
  const result = await sendWithRetry(() => options.sender.sendText(options.groupJid, message), 3);

  const sentState: BotState = {
    ...nextState,
    sentDates: {
      ...nextState.sentDates,
      [dateKey]: {
        verseIds: batch.verseIds,
        label: batch.label,
        sentAt: options.now.toISOString(),
        messageId: result.messageId
      }
    }
  };

  return { status: 'sent', dateKey, verseIds: batch.verseIds, messageId: result.messageId, nextState: sentState };
}

async function selectVerses(options: RunDailyGitaOptions): Promise<{ batch: GitaVerseBatch; nextState: BotState }> {
  if (options.selectVerses) {
    return options.selectVerses(options.state);
  }

  return selectNextGitaVerses({
    config: options.config,
    state: options.state,
    fetchImpl: options.fetchImpl
  });
}

async function renderMessage(options: RunDailyGitaOptions, batch: GitaVerseBatch): Promise<string> {
  if (options.renderMessage) {
    return options.renderMessage(batch);
  }

  return renderGitaMessage(batch);
}

async function sendWithRetry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
