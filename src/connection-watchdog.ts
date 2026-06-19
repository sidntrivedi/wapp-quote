import type { Logger } from 'pino';
import type { WhatsAppSender } from './types.js';

export function startConnectionWatchdog(options: {
  sender: Pick<WhatsAppSender, 'ensureConnected' | 'isConnected' | 'isLoggedOut'>;
  logger: Logger;
  intervalMs?: number;
}): () => void {
  const intervalMs = options.intervalMs ?? 5 * 60 * 1000;

  const timer = setInterval(() => {
    void runWatchdogTick(options);
  }, intervalMs);

  timer.unref();

  return () => clearInterval(timer);
}

async function runWatchdogTick(options: {
  sender: Pick<WhatsAppSender, 'ensureConnected' | 'isConnected' | 'isLoggedOut'>;
  logger: Logger;
}): Promise<void> {
  if (options.sender.isLoggedOut()) {
    options.logger.error('WhatsApp session is logged out; re-pair and restart the machine');
    return;
  }

  if (options.sender.isConnected()) {
    return;
  }

  options.logger.warn('WhatsApp is disconnected; watchdog reconnecting');
  try {
    await options.sender.ensureConnected();
    options.logger.info('watchdog reconnected WhatsApp');
  } catch (error) {
    options.logger.error({ error }, 'watchdog reconnect failed');
  }
}
