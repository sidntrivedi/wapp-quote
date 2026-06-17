import { describe, expect, it } from 'vitest';
import { cronExpressionForTime, localDateKey } from '../src/date.js';

describe('date helpers', () => {
  it('formats local date keys in the configured timezone', () => {
    expect(localDateKey(new Date('2026-06-15T18:45:00.000Z'), 'Asia/Kolkata')).toBe('2026-06-16');
  });

  it('converts HH:mm to a cron expression', () => {
    expect(cronExpressionForTime('06:00')).toBe('0 6 * * *');
    expect(cronExpressionForTime('21:30')).toBe('30 21 * * *');
  });
});
