import fs from 'node:fs/promises';
import path from 'node:path';
import type { HealthEntry, HealthState } from './health-types.js';

const MAX_ENTRIES = 400;

const defaultState: HealthState = {
  entries: {}
};

export class HealthStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<HealthState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<HealthState>;
      return { entries: normalizeEntries(parsed.entries) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(defaultState);
      }
      throw error;
    }
  }

  async save(state: HealthState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(pruned(state), null, 2)}\n`, 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }
}

function pruned(state: HealthState): HealthState {
  const dates = Object.keys(state.entries).sort();
  if (dates.length <= MAX_ENTRIES) {
    return state;
  }

  const keep = dates.slice(dates.length - MAX_ENTRIES);
  const entries: Record<string, HealthEntry> = {};
  for (const date of keep) {
    entries[date] = state.entries[date];
  }
  return { entries };
}

function normalizeEntries(entries: HealthState['entries'] | undefined): HealthState['entries'] {
  const normalized: HealthState['entries'] = {};
  for (const [date, entry] of Object.entries(entries ?? {})) {
    if (entry && typeof entry === 'object' && typeof entry.date === 'string') {
      normalized[date] = entry as HealthEntry;
    }
  }
  return normalized;
}

/**
 * Merge a new entry into existing state. If an entry already exists for the
 * same date, the new non-undefined fields overwrite the old ones (so a later
 * payload can refine an earlier partial one). `postedAt`/`messageId` are
 * preserved from the existing entry unless explicitly provided.
 */
export function upsertEntry(state: HealthState, entry: HealthEntry): HealthState {
  const existing = state.entries[entry.date];
  const merged: HealthEntry = existing ? { ...existing, ...entry } : entry;

  if (existing?.postedAt && entry.postedAt === undefined) {
    merged.postedAt = existing.postedAt;
  }
  if (existing?.messageId && entry.messageId === undefined) {
    merged.messageId = existing.messageId;
  }

  return {
    entries: {
      ...state.entries,
      [entry.date]: merged
    }
  };
}

export function markPosted(
  state: HealthState,
  date: string,
  postedAt: string,
  messageId?: string
): HealthState {
  const existing = state.entries[date];
  if (!existing) {
    return state;
  }

  return {
    entries: {
      ...state.entries,
      [date]: {
        ...existing,
        postedAt,
        ...(messageId ? { messageId } : {})
      }
    }
  };
}

/**
 * Count consecutive days up to and including `date` where steps met the goal.
 */
export function stepGoalStreak(state: HealthState, date: string, stepGoal: number): number {
  if (stepGoal <= 0) {
    return 0;
  }

  let streak = 0;
  let cursor = date;

  // Walk backwards day-by-day while each day met the goal.
  for (let guard = 0; guard < MAX_ENTRIES; guard += 1) {
    const entry = state.entries[cursor];
    if (!entry || entry.steps === undefined || entry.steps < stepGoal) {
      break;
    }
    streak += 1;
    cursor = previousDate(cursor);
  }

  return streak;
}

/**
 * Average steps over the trailing `days` window ending at `date` (inclusive),
 * counting only days that have a steps value.
 */
export function trailingStepsAverage(
  state: HealthState,
  date: string,
  days: number
): number | undefined {
  let total = 0;
  let count = 0;
  let cursor = date;

  for (let i = 0; i < days; i += 1) {
    const entry = state.entries[cursor];
    if (entry?.steps !== undefined) {
      total += entry.steps;
      count += 1;
    }
    cursor = previousDate(cursor);
  }

  if (count === 0) {
    return undefined;
  }
  return Math.round(total / count);
}

export function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
