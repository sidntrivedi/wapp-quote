import type { AppConfig } from './config.js';
import { localDateKey } from './date.js';
import { selectNextGitaVerse } from './gita.js';
import { renderGitaMessage } from './message.js';
import type { BotState, GitaVerse, WhatsAppSender } from './types.js';

type RunDailyGitaOptions = {
  sender: Pick<WhatsAppSender, 'sendText'>;
  state: BotState;
  groupJid: string;
  now: Date;
  timeZone: string;
  config: Pick<AppConfig, 'gitaApiBaseUrl' | 'gitaApiTimeoutMs' | 'gitaHindiField'>;
  fetchImpl?: typeof fetch;
  selectVerse?: (state: BotState) => Promise<{ verse: GitaVerse; nextState: BotState }> | { verse: GitaVerse; nextState: BotState };
  renderMessage?: (verse: GitaVerse) => Promise<string> | string;
  force?: boolean;
};

export type RunDailyGitaResult =
  | { status: 'skipped'; dateKey: string; verseId: string }
  | { status: 'sent'; dateKey: string; verseId: string; messageId?: string; nextState: BotState };

export async function runDailyGita(options: RunDailyGitaOptions): Promise<RunDailyGitaResult> {
  const dateKey = localDateKey(options.now, options.timeZone);
  const existing = options.state.sentDates[dateKey];

  if (existing && !options.force) {
    return { status: 'skipped', dateKey, verseId: existing.verseId };
  }

  const { verse, nextState } = await selectVerse(options);
  const message = await renderMessage(options, verse);
  const result = await sendWithRetry(() => options.sender.sendText(options.groupJid, message), 3);

  const sentState: BotState = {
    ...nextState,
    sentDates: {
      ...nextState.sentDates,
      [dateKey]: {
        verseId: verse.id,
        label: verse.label,
        sentAt: options.now.toISOString(),
        messageId: result.messageId
      }
    }
  };

  return { status: 'sent', dateKey, verseId: verse.id, messageId: result.messageId, nextState: sentState };
}

async function selectVerse(options: RunDailyGitaOptions): Promise<{ verse: GitaVerse; nextState: BotState }> {
  if (options.selectVerse) {
    return options.selectVerse(options.state);
  }

  return selectNextGitaVerse({
    config: options.config,
    state: options.state,
    fetchImpl: options.fetchImpl
  });
}

async function renderMessage(options: RunDailyGitaOptions, verse: GitaVerse): Promise<string> {
  if (options.renderMessage) {
    return options.renderMessage(verse);
  }

  return renderGitaMessage(verse);
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
