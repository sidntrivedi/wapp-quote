import cron from 'node-cron';
import type { Logger } from 'pino';
import { cronExpressionForTime, getCatchUpEligibility, localDateKey, type CatchUpEligibility } from './date.js';

const DEFAULT_MISSED_EXECUTION_TOLERANCE_MS = 5 * 60 * 1000;
const DEFAULT_CATCH_UP_INTERVAL_MS = 15 * 60 * 1000;

export type DailyScheduleHandle = {
  stop: () => void;
};

type CatchUpTrigger = 'missed' | 'catch-up';

export function startDailySchedule(options: {
  quoteTime: string;
  timeZone: string;
  logger: Logger;
  task: () => Promise<void>;
  hasSentToday?: () => Promise<boolean>;
  missedExecutionToleranceMs?: number;
  catchUpIntervalMs?: number;
  catchUpEnabled?: boolean;
}): DailyScheduleHandle {
  const expression = cronExpressionForTime(options.quoteTime);
  const missedExecutionToleranceMs = options.missedExecutionToleranceMs ?? DEFAULT_MISSED_EXECUTION_TOLERANCE_MS;
  const catchUpIntervalMs = options.catchUpIntervalMs ?? DEFAULT_CATCH_UP_INTERVAL_MS;
  let expiredCatchUpLoggedForDateKey: string | undefined;

  options.logger.info(
    { expression, timeZone: options.timeZone, missedExecutionToleranceMs, catchUpIntervalMs },
    'starting daily quote schedule'
  );

  let sendInFlight = false;

  const runTask = async (reason: 'scheduled' | CatchUpTrigger): Promise<void> => {
    if (sendInFlight) {
      options.logger.debug({ reason }, 'daily quote send already in flight; skipping');
      return;
    }

    sendInFlight = true;
    try {
      await options.task();
    } finally {
      sendInFlight = false;
    }
  };

  const scheduledTask = cron.schedule(
    expression,
    () => {
      void runTask('scheduled').catch((error: unknown) => {
        logTaskFailure(options.logger, error);
      });
    },
    {
      timezone: options.timeZone,
      missedExecutionTolerance: missedExecutionToleranceMs,
      noOverlap: true
    }
  );

  scheduledTask.on('execution:missed', () => {
    void maybeRunCatchUp({
      options,
      trigger: 'missed',
      runTask,
      expiredCatchUpLoggedForDateKey: (dateKey) => {
        expiredCatchUpLoggedForDateKey = dateKey;
      },
      getExpiredCatchUpLoggedForDateKey: () => expiredCatchUpLoggedForDateKey
    }).catch((error: unknown) => {
      logTaskFailure(options.logger, error);
    });
  });

  let catchUpTimer: ReturnType<typeof setInterval> | undefined;

  if (options.catchUpEnabled ?? true) {
    const runIntervalCatchUp = () => {
      void maybeRunCatchUp({
        options,
        trigger: 'catch-up',
        runTask,
        expiredCatchUpLoggedForDateKey: (dateKey) => {
          expiredCatchUpLoggedForDateKey = dateKey;
        },
        getExpiredCatchUpLoggedForDateKey: () => expiredCatchUpLoggedForDateKey
      }).catch((error: unknown) => {
        logTaskFailure(options.logger, error);
      });
    };

    runIntervalCatchUp();
    catchUpTimer = setInterval(runIntervalCatchUp, catchUpIntervalMs);
    catchUpTimer.unref();
  } else {
    options.logger.info('interval catch-up disabled; only cron and execution:missed will send');
  }

  return {
    stop: () => {
      scheduledTask.stop();
      if (catchUpTimer) {
        clearInterval(catchUpTimer);
      }
    }
  };
}

async function maybeRunCatchUp(params: {
  options: {
    quoteTime: string;
    timeZone: string;
    logger: Logger;
    hasSentToday?: () => Promise<boolean>;
  };
  trigger: CatchUpTrigger;
  runTask: (reason: 'scheduled' | CatchUpTrigger) => Promise<void>;
  getExpiredCatchUpLoggedForDateKey: () => string | undefined;
  expiredCatchUpLoggedForDateKey: (dateKey: string) => void;
}): Promise<void> {
  const now = new Date();
  const dateKey = localDateKey(now, params.options.timeZone);

  if (params.options.hasSentToday && (await params.options.hasSentToday())) {
    return;
  }

  const eligibility = getCatchUpEligibility(now, params.options.quoteTime, params.options.timeZone);

  if (eligibility.reason === 'before-quote-time') {
    return;
  }

  if (eligibility.reason === 'window-expired') {
    logCatchUpWindowExpired({
      logger: params.options.logger,
      dateKey,
      quoteTime: params.options.quoteTime,
      trigger: params.trigger,
      eligibility,
      getExpiredCatchUpLoggedForDateKey: params.getExpiredCatchUpLoggedForDateKey,
      markExpiredCatchUpLoggedForDateKey: params.expiredCatchUpLoggedForDateKey
    });
    return;
  }

  params.options.logger.info(
    {
      trigger: params.trigger,
      dateKey,
      quoteTime: params.options.quoteTime,
      catchUpDeadline: eligibility.catchUpDeadline,
      minutesPastQuoteTime: eligibility.minutesPastQuoteTime
    },
    'daily quote not sent yet within catch-up window; running catch-up send'
  );
  await params.runTask(params.trigger);
}

function logCatchUpWindowExpired(options: {
  logger: Logger;
  dateKey: string;
  quoteTime: string;
  trigger: CatchUpTrigger;
  eligibility: CatchUpEligibility;
  getExpiredCatchUpLoggedForDateKey: () => string | undefined;
  markExpiredCatchUpLoggedForDateKey: (dateKey: string) => void;
}): void {
  if (options.getExpiredCatchUpLoggedForDateKey() === options.dateKey) {
    return;
  }

  options.markExpiredCatchUpLoggedForDateKey(options.dateKey);
  options.logger.warn(
    {
      dateKey: options.dateKey,
      trigger: options.trigger,
      quoteTime: options.quoteTime,
      catchUpDeadline: options.eligibility.catchUpDeadline,
      minutesPastQuoteTime: options.eligibility.minutesPastQuoteTime
    },
    'daily quote catch-up skipped; catch-up window expired for today'
  );
}

function logTaskFailure(logger: Logger, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ err, message: err.message, stack: err.stack }, 'scheduled quote send failed');
}
