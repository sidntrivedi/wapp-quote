import { describe, expect, it } from 'vitest';
import {
  cronExpressionForTime,
  getCatchUpEligibility,
  isPastQuoteTime,
  localDateKey
} from '../src/date.js';

describe('date helpers', () => {
  it('formats local date keys in the configured timezone', () => {
    expect(localDateKey(new Date('2026-06-15T18:45:00.000Z'), 'Asia/Kolkata')).toBe('2026-06-16');
  });

  it('converts HH:mm to a cron expression', () => {
    expect(cronExpressionForTime('06:00')).toBe('0 6 * * *');
    expect(cronExpressionForTime('21:30')).toBe('30 21 * * *');
  });

  it('detects when the configured quote time has passed today', () => {
    const before = new Date('2026-06-21T00:29:00.000Z');
    const after = new Date('2026-06-21T00:31:00.000Z');

    expect(isPastQuoteTime(before, '06:00', 'Asia/Kolkata')).toBe(false);
    expect(isPastQuoteTime(after, '06:00', 'Asia/Kolkata')).toBe(true);
  });

  it('allows catch-up only within four hours after quote time', () => {
    const atQuoteTime = new Date('2026-06-21T00:30:00.000Z');
    const beforeDeadline = new Date('2026-06-21T04:30:00.000Z');
    const afterDeadline = new Date('2026-06-21T04:31:00.000Z');

    expect(getCatchUpEligibility(atQuoteTime, '06:00', 'Asia/Kolkata')).toMatchObject({
      eligible: true,
      reason: 'within-window',
      catchUpDeadline: '10:00'
    });
    expect(getCatchUpEligibility(beforeDeadline, '06:00', 'Asia/Kolkata')).toMatchObject({
      eligible: true,
      reason: 'within-window'
    });
    expect(getCatchUpEligibility(afterDeadline, '06:00', 'Asia/Kolkata')).toMatchObject({
      eligible: false,
      reason: 'window-expired'
    });
  });
});
