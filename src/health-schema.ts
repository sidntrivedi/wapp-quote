import { z } from 'zod';
import { localDateKey } from './date.js';
import type { HealthEntry, HealthWorkout } from './health-types.js';

/**
 * Apple Shortcuts can serialise Health values as numbers or as strings
 * (e.g. "8,431" steps or "27000 seconds"). This coercion strips common units and
 * thousands separators before parsing, and treats blank/missing values as
 * undefined rather than failing the whole payload.
 */
const looseNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/[^0-9.\-]/g, '').trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '.') {
      return undefined;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}, z.number().nonnegative().optional());

const looseString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().max(500).optional());

const workoutSchema = z
  .object({
    type: looseString,
    minutes: looseNumber,
    energyKcal: looseNumber
  })
  .transform((workout): HealthWorkout | undefined => {
    const type = workout.type ?? 'Workout';
    if (workout.minutes === undefined && workout.energyKcal === undefined && !workout.type) {
      return undefined;
    }
    return {
      type,
      ...(workout.minutes !== undefined ? { minutes: workout.minutes } : {}),
      ...(workout.energyKcal !== undefined ? { energyKcal: workout.energyKcal } : {})
    };
  });

const workoutsSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  // A single workout object, or a plain string like "Running".
  if (typeof value === 'string') {
    return [{ type: value }];
  }
  return [value];
}, z.array(workoutSchema));

export const healthPayloadSchema = z.object({
  date: looseString,
  steps: looseNumber,
  distanceKm: looseNumber,
  activeEnergyKcal: looseNumber,
  exerciseMinutes: looseNumber,
  standHours: looseNumber,
  sleepSeconds: looseNumber,
  sleepQuality: looseString,
  restingHeartRate: looseNumber,
  workouts: workoutsSchema.optional(),
  notes: looseString
});

export type HealthPayload = z.infer<typeof healthPayloadSchema>;

/**
 * Validate and normalise a raw webhook body into a HealthEntry.
 * `date` defaults to today's date key in the configured timezone.
 */
export function parseHealthPayload(
  body: unknown,
  options: { timeZone: string; now?: Date }
): HealthEntry {
  const parsed = healthPayloadSchema.parse(body);
  const now = options.now ?? new Date();
  const date = normalizeDate(parsed.date) ?? localDateKey(now, options.timeZone);
  const workouts = (parsed.workouts ?? []).filter((workout): workout is HealthWorkout => Boolean(workout));

  return {
    date,
    ...(parsed.steps !== undefined ? { steps: Math.round(parsed.steps) } : {}),
    ...(parsed.distanceKm !== undefined ? { distanceKm: round1(parsed.distanceKm) } : {}),
    ...(parsed.activeEnergyKcal !== undefined ? { activeEnergyKcal: Math.round(parsed.activeEnergyKcal) } : {}),
    ...(parsed.exerciseMinutes !== undefined ? { exerciseMinutes: Math.round(parsed.exerciseMinutes) } : {}),
    ...(parsed.standHours !== undefined ? { standHours: Math.round(parsed.standHours) } : {}),
    ...(parsed.sleepSeconds !== undefined ? { sleepHours: round1(parsed.sleepSeconds / 3600) } : {}),
    ...(parsed.sleepQuality !== undefined ? { sleepQuality: parsed.sleepQuality } : {}),
    ...(parsed.restingHeartRate !== undefined ? { restingHeartRate: Math.round(parsed.restingHeartRate) } : {}),
    ...(workouts.length > 0 ? { workouts } : {}),
    ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
    receivedAt: now.toISOString()
  };
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  // Accept YYYY-MM-DD directly.
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Fall back to Date parsing for other formats (best effort).
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
