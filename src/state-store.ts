import fs from 'node:fs/promises';
import path from 'node:path';
import type { BotState } from './types.js';

const defaultState: BotState = {
  gitaCursor: 0,
  sentDates: {}
};

export class StateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BotState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<BotState>;

      return {
        gitaCursor: normalizeGitaCursor(parsed.gitaCursor),
        sentDates: normalizeSentDates(parsed.sentDates)
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(defaultState);
      }

      throw error;
    }
  }

  async save(state: BotState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }
}

function normalizeGitaCursor(cursor: unknown): number {
  if (typeof cursor === 'number' && Number.isInteger(cursor) && cursor >= 0) {
    return cursor;
  }

  return 0;
}

function normalizeSentDates(
  sentDates: Record<string, Partial<BotState['sentDates'][string]>> | undefined
): BotState['sentDates'] {
  const normalized: BotState['sentDates'] = {};

  for (const [dateKey, entry] of Object.entries(sentDates ?? {})) {
    if (!Array.isArray(entry?.verseIds) || entry.verseIds.length === 0 || !entry.sentAt) {
      continue;
    }

    const verseIds = entry.verseIds.filter((id): id is string => typeof id === 'string');
    if (verseIds.length === 0) {
      continue;
    }

    normalized[dateKey] = {
      verseIds,
      label: typeof entry.label === 'string' ? entry.label : '',
      sentAt: entry.sentAt,
      ...(entry.messageId ? { messageId: entry.messageId } : {})
    };
  }

  return normalized;
}
