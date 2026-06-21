export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function cronExpressionForTime(hhmm: string): string {
  const [hour, minute] = hhmm.split(':');
  return `${Number(minute)} ${Number(hour)} * * *`;
}

export function isPastQuoteTime(now: Date, quoteTime: string, timeZone: string): boolean {
  const eligibility = getCatchUpEligibility(now, quoteTime, timeZone);
  return eligibility.reason !== 'before-quote-time';
}

export const DEFAULT_CATCH_UP_GRACE_HOURS = 4;

export type CatchUpEligibilityReason = 'before-quote-time' | 'within-window' | 'window-expired';

export type CatchUpEligibility = {
  eligible: boolean;
  reason: CatchUpEligibilityReason;
  minutesPastQuoteTime: number;
  catchUpDeadline: string;
};

export function getCatchUpEligibility(
  now: Date,
  quoteTime: string,
  timeZone: string,
  graceHours: number = DEFAULT_CATCH_UP_GRACE_HOURS
): CatchUpEligibility {
  const [quoteHour, quoteMinute] = quoteTime.split(':').map(Number);
  const { hour, minute } = localHourMinute(now, timeZone);
  const minutesPastQuoteTime = (hour - quoteHour) * 60 + (minute - quoteMinute);
  const catchUpDeadline = formatLocalTime(quoteHour + graceHours, quoteMinute);

  if (minutesPastQuoteTime < 0) {
    return { eligible: false, reason: 'before-quote-time', minutesPastQuoteTime, catchUpDeadline };
  }

  if (minutesPastQuoteTime > graceHours * 60) {
    return { eligible: false, reason: 'window-expired', minutesPastQuoteTime, catchUpDeadline };
  }

  return { eligible: true, reason: 'within-window', minutesPastQuoteTime, catchUpDeadline };
}

function formatLocalTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function localHourMinute(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(values.hour), minute: Number(values.minute) };
}
