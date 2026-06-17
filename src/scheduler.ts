import cron from 'node-cron';
import type { Logger } from 'pino';
import { cronExpressionForTime } from './date.js';

export function startDailySchedule(options: {
  quoteTime: string;
  timeZone: string;
  logger: Logger;
  task: () => Promise<void>;
}): cron.ScheduledTask {
  const expression = cronExpressionForTime(options.quoteTime);

  options.logger.info({ expression, timeZone: options.timeZone }, 'starting daily quote schedule');

  return cron.schedule(
    expression,
    () => {
      options.task().catch((error: unknown) => {
        options.logger.error({ error }, 'scheduled quote send failed');
      });
    },
    { timezone: options.timeZone }
  );
}
