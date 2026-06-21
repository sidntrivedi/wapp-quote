import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StateStore } from '../src/state-store.js';
import type { BotState } from '../src/types.js';

describe('StateStore', () => {
  const tempDir = path.join(os.tmpdir(), `wapp-quote-state-${process.pid}`);
  const filePath = path.join(tempDir, 'state.json');

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns default state when the file is missing', async () => {
    const store = new StateStore(filePath);

    await expect(store.load()).resolves.toEqual({
      rotationIndex: 0,
      usedQuoteIds: [],
      sentDates: {}
    });
  });

  it('loads and normalizes persisted state', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        rotationIndex: 3,
        usedQuoteIds: ['q1', 42, 'q2'],
        sentDates: { '2026-06-16': { quoteId: 'q1', sentAt: '2026-06-16T00:00:00.000Z' } }
      }),
      'utf8'
    );

    const store = new StateStore(filePath);
    await expect(store.load()).resolves.toEqual({
      rotationIndex: 3,
      usedQuoteIds: ['q1', 'q2'],
      sentDates: { '2026-06-16': { quoteId: 'q1', sentAt: '2026-06-16T00:00:00.000Z' } }
    });
  });

  it('falls back to defaults for invalid rotation index', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ rotationIndex: 'bad' }), 'utf8');

    const store = new StateStore(filePath);
    await expect(store.load()).resolves.toMatchObject({ rotationIndex: 0 });
  });

  it('writes atomically via a temp file', async () => {
    const store = new StateStore(filePath);
    const state: BotState = {
      rotationIndex: 1,
      usedQuoteIds: ['q1'],
      sentDates: { '2026-06-16': { quoteId: 'q1', sentAt: '2026-06-16T00:00:00.000Z' } }
    };

    await store.save(state);

    expect(await fs.readFile(filePath, 'utf8')).toContain('"rotationIndex": 1');
    await expect(fs.stat(`${filePath}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rethrows non-ENOENT read errors', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(filePath, '{not json', 'utf8');

    const store = new StateStore(filePath);
    await expect(store.load()).rejects.toThrow();
  });
});
