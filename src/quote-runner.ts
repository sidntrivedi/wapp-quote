import { localDateKey } from './date.js';
import { renderQuoteMessage } from './message.js';
import type { BotState, Quote, WhatsAppSender } from './types.js';

type RunDailyQuoteOptions = {
  sender: Pick<WhatsAppSender, 'sendText'>;
  state: BotState;
  groupJid: string;
  now: Date;
  timeZone: string;
  selectQuote?: (state: BotState) => Promise<{ quote: Quote; nextState: BotState }> | { quote: Quote; nextState: BotState };
  renderMessage?: (quote: Quote) => Promise<string> | string;
  force?: boolean;
};

export type RunDailyQuoteResult =
  | { status: 'skipped'; dateKey: string; quoteId: string }
  | { status: 'sent'; dateKey: string; quoteId: string; messageId?: string; nextState: BotState };

export async function runDailyQuote(options: RunDailyQuoteOptions): Promise<RunDailyQuoteResult> {
  const dateKey = localDateKey(options.now, options.timeZone);
  const existing = options.state.sentDates[dateKey];

  if (existing && !options.force) {
    return { status: 'skipped', dateKey, quoteId: existing.quoteId };
  }

  const { quote, nextState } = await selectQuote(options);
  const message = await renderMessage(options, quote);
  const result = await sendWithRetry(() => options.sender.sendText(options.groupJid, message), 3);

  const sentState: BotState = {
    ...nextState,
    sentDates: {
      ...nextState.sentDates,
      [dateKey]: {
        quoteId: quote.id,
        author: quote.author,
        sentAt: options.now.toISOString(),
        messageId: result.messageId
      }
    }
  };

  return { status: 'sent', dateKey, quoteId: quote.id, messageId: result.messageId, nextState: sentState };
}

async function renderMessage(options: RunDailyQuoteOptions, quote: Quote): Promise<string> {
  if (options.renderMessage) {
    return options.renderMessage(quote);
  }

  return renderQuoteMessage(quote);
}

async function selectQuote(options: RunDailyQuoteOptions): Promise<{ quote: Quote; nextState: BotState }> {
  if (options.selectQuote) {
    return options.selectQuote(options.state);
  }

  const { selectNextQuote } = await import('./quotes.js');
  return selectNextQuote(options.state);
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
