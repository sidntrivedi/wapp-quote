import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startDailySchedule } from '../src/scheduler.js';

describe('startDailySchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs catch-up after quote time when today is not sent', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const handle = startDailySchedule({
      quoteTime: '06:00',
      timeZone: 'Asia/Kolkata',
      logger: logger as never,
      hasSentToday: async () => false,
      catchUpIntervalMs: 60_000,
      task
    });

    vi.setSystemTime(new Date('2026-06-21T01:00:00.000Z'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(task).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it('skips catch-up before quote time and when already sent', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const handle = startDailySchedule({
      quoteTime: '06:00',
      timeZone: 'Asia/Kolkata',
      logger: logger as never,
      hasSentToday: async () => true,
      catchUpIntervalMs: 60_000,
      task
    });

    vi.setSystemTime(new Date('2026-06-21T01:00:00.000Z'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).not.toHaveBeenCalled();

    handle.stop();
  });

  it('skips catch-up after the four-hour window and logs once', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const handle = startDailySchedule({
      quoteTime: '06:00',
      timeZone: 'Asia/Kolkata',
      logger: logger as never,
      hasSentToday: async () => false,
      catchUpIntervalMs: 60_000,
      task
    });

    vi.setSystemTime(new Date('2026-06-21T04:31:00.000Z'));
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(task).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[1]).toBe('daily quote catch-up skipped; catch-up window expired for today');

    handle.stop();
  });

  it('does not start interval catch-up when disabled', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const handle = startDailySchedule({
      quoteTime: '06:00',
      timeZone: 'Asia/Kolkata',
      logger: logger as never,
      hasSentToday: async () => false,
      catchUpEnabled: false,
      task
    });

    vi.setSystemTime(new Date('2026-06-21T01:00:00.000Z'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(task).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('interval catch-up disabled; only cron and execution:missed will send');

    handle.stop();
  });
});
