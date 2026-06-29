import { describe, expect, it } from 'vitest';
import { parseHealthPayload } from '../src/health-schema.js';

describe('parseHealthPayload', () => {
  const timeZone = 'Asia/Kolkata';

  it('parses a full numeric payload', () => {
    const entry = parseHealthPayload(
      {
        date: '2026-06-21',
        steps: 9123,
        distanceKm: 6.4,
        activeEnergyKcal: 520,
        exerciseMinutes: 35,
        sleepSeconds: 27000,
        sleepQuality: 'अच्छी',
        restingHeartRate: 58
      },
      { timeZone, now: new Date('2026-06-21T16:00:00Z') }
    );

    expect(entry).toMatchObject({
      date: '2026-06-21',
      steps: 9123,
      distanceKm: 6.4,
      activeEnergyKcal: 520,
      exerciseMinutes: 35,
      sleepHours: 7.5, // 27000 / 3600 = 7.5
      sleepQuality: 'अच्छी',
      restingHeartRate: 58
    });
    expect(entry.receivedAt).toBe('2026-06-21T16:00:00.000Z');
  });

  it('converts sleepSeconds to hours', () => {
    const entry = parseHealthPayload({ sleepSeconds: 26280 }, { timeZone });
    expect(entry.sleepHours).toBe(7.3); // 26280 / 3600 = 7.3
  });

  it('ignores sleepHours from the incoming payload', () => {
    const entry = parseHealthPayload({ sleepHours: 7.5 }, { timeZone });
    expect(entry.sleepHours).toBeUndefined();
  });

  it('coerces stringified numbers with units and separators', () => {
    const entry = parseHealthPayload(
      {
        steps: '9,123 steps',
        sleepSeconds: '26,280 seconds',
        distanceKm: '6.4 km'
      },
      { timeZone, now: new Date('2026-06-21T16:00:00Z') }
    );

    expect(entry.steps).toBe(9123);
    expect(entry.sleepHours).toBe(7.3);
    expect(entry.distanceKm).toBe(6.4);
  });

  it('defaults the date to today in the configured timezone', () => {
    // 2026-06-20T20:00Z is 2026-06-21 01:30 IST.
    const entry = parseHealthPayload({ steps: 100 }, { timeZone, now: new Date('2026-06-20T20:00:00Z') });
    expect(entry.date).toBe('2026-06-21');
  });

  it('treats blank and missing values as undefined', () => {
    const entry = parseHealthPayload(
      { steps: '', sleepSeconds: null, sleepQuality: '   ' },
      { timeZone, now: new Date('2026-06-21T16:00:00Z') }
    );

    expect(entry.steps).toBeUndefined();
    expect(entry.sleepHours).toBeUndefined();
    expect(entry.sleepQuality).toBeUndefined();
  });

  it('normalizes a single workout string into an array', () => {
    const entry = parseHealthPayload({ workouts: 'Running' }, { timeZone });
    expect(entry.workouts).toEqual([{ type: 'Running' }]);
  });

  it('parses an array of workout objects', () => {
    const entry = parseHealthPayload(
      { workouts: [{ type: 'Yoga', minutes: '30 min' }, { type: 'Walk', minutes: 20, energyKcal: 80 }] },
      { timeZone }
    );

    expect(entry.workouts).toEqual([
      { type: 'Yoga', minutes: 30 },
      { type: 'Walk', minutes: 20, energyKcal: 80 }
    ]);
  });

  it('rounds steps and energy to integers', () => {
    const entry = parseHealthPayload({ steps: 9123.7, activeEnergyKcal: 520.4 }, { timeZone });
    expect(entry.steps).toBe(9124);
    expect(entry.activeEnergyKcal).toBe(520);
  });
});
