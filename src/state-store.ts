import fs from 'node:fs/promises';
import path from 'node:path';
import type { BotState } from './types.js';

const defaultState: BotState = {
  rotationIndex: 0,
  usedQuoteIds: [],
  sentDates: {}
};

export class StateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BotState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<BotState>;

      return {
        rotationIndex: typeof parsed.rotationIndex === 'number' && Number.isInteger(parsed.rotationIndex) ? parsed.rotationIndex : 0,
        usedQuoteIds: Array.isArray(parsed.usedQuoteIds) ? parsed.usedQuoteIds.filter((id): id is string => typeof id === 'string') : [],
        sentDates: parsed.sentDates ?? {}
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
