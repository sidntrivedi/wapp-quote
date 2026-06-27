import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HealthStore,
  markPosted,
  previousDate,
  stepGoalStreak,
  trailingStepsAverage,
  upsertEntry
} from '../src/health-store.js';
import type { HealthEntry, HealthState } from '../src/health-types.js';

function entry(date: string, steps?: number): HealthEntry {
  return { date, ...(steps !== undefined ? { steps } : {}), receivedAt: `${date}T00:00:00.000Z` };
}

describe('HealthStore', () => {
  const tempDir = path.join(os.tmpdir(), `wapp-quote-health-${process.pid}`);
  const filePath = path.join(tempDir, 'health.json');

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns default state when the file is missing', async () => {
    const store = new HealthStore(filePath);
    await expect(store.load()).resolves.toEqual({ entries: {} });
  });

  it('writes atomically and reloads', async () => {
    const store = new HealthStore(filePath);
    const state: HealthState = { entries: { '2026-06-21': entry('2026-06-21', 9000) } };
    await store.save(state);

    await expect(fs.stat(`${filePath}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.load()).resolves.toEqual(state);
  });

  it('drops malformed entries on load', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({ entries: { good: { date: '2026-06-21', receivedAt: 'x' }, bad: { nope: true } } }),
      'utf8'
    );

    const store = new HealthStore(filePath);
    const loaded = await store.load();
    expect(Object.keys(loaded.entries)).toEqual(['good']);
  });
});

describe('upsertEntry', () => {
  it('inserts a new entry', () => {
    const next = upsertEntry({ entries: {} }, entry('2026-06-21', 100));
    expect(next.entries['2026-06-21'].steps).toBe(100);
  });

  it('merges new fields over an existing entry and preserves postedAt', () => {
    const base: HealthState = {
      entries: { '2026-06-21': { ...entry('2026-06-21', 100), postedAt: '2026-06-21T10:00:00.000Z', messageId: 'm1' } }
    };
    const next = upsertEntry(base, { ...entry('2026-06-21', 5000), sleepHours: 7 });

    expect(next.entries['2026-06-21'].steps).toBe(5000);
    expect(next.entries['2026-06-21'].sleepHours).toBe(7);
    expect(next.entries['2026-06-21'].postedAt).toBe('2026-06-21T10:00:00.000Z');
    expect(next.entries['2026-06-21'].messageId).toBe('m1');
  });
});

describe('markPosted', () => {
  it('records postedAt and messageId', () => {
    const base = upsertEntry({ entries: {} }, entry('2026-06-21', 100));
    const next = markPosted(base, '2026-06-21', '2026-06-21T12:00:00.000Z', 'msg-9');
    expect(next.entries['2026-06-21'].postedAt).toBe('2026-06-21T12:00:00.000Z');
    expect(next.entries['2026-06-21'].messageId).toBe('msg-9');
  });

  it('is a no-op for an unknown date', () => {
    const base: HealthState = { entries: {} };
    expect(markPosted(base, '2026-06-21', 'x')).toBe(base);
  });
});

describe('previousDate', () => {
  it('handles month and year boundaries', () => {
    expect(previousDate('2026-06-21')).toBe('2026-06-20');
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(previousDate('2026-01-01')).toBe('2025-12-31');
  });
});

describe('stepGoalStreak', () => {
  it('counts consecutive days meeting the goal', () => {
    const state: HealthState = {
      entries: {
        '2026-06-19': entry('2026-06-19', 9000),
        '2026-06-20': entry('2026-06-20', 8500),
        '2026-06-21': entry('2026-06-21', 8001)
      }
    };
    expect(stepGoalStreak(state, '2026-06-21', 8000)).toBe(3);
  });

  it('breaks the streak on a missed day or gap', () => {
    const state: HealthState = {
      entries: {
        '2026-06-19': entry('2026-06-19', 9000),
        '2026-06-20': entry('2026-06-20', 100),
        '2026-06-21': entry('2026-06-21', 8500)
      }
    };
    expect(stepGoalStreak(state, '2026-06-21', 8000)).toBe(1);
  });

  it('returns 0 when the step goal is 0', () => {
    const state: HealthState = { entries: { '2026-06-21': entry('2026-06-21', 9000) } };
    expect(stepGoalStreak(state, '2026-06-21', 0)).toBe(0);
  });
});

describe('trailingStepsAverage', () => {
  it('averages only days with step data in the window', () => {
    const state: HealthState = {
      entries: {
        '2026-06-19': entry('2026-06-19', 6000),
        '2026-06-20': entry('2026-06-20'),
        '2026-06-21': entry('2026-06-21', 8000)
      }
    };
    expect(trailingStepsAverage(state, '2026-06-21', 7)).toBe(7000);
  });

  it('returns undefined when no data exists', () => {
    expect(trailingStepsAverage({ entries: {} }, '2026-06-21', 7)).toBeUndefined();
  });
});
