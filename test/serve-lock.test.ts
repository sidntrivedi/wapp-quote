import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireServeLock, assertServeNotRunning, releaseServeLock } from '../src/serve-lock.js';

describe('serve-lock', () => {
  const tempDir = path.join(os.tmpdir(), `wapp-quote-lock-${process.pid}`);

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('blocks a second serve lock while the first process is alive', async () => {
    await acquireServeLock(tempDir);

    await expect(acquireServeLock(tempDir)).rejects.toThrow(/serve is already running/);
    await releaseServeLock(tempDir);
  });

  it('blocks one-shot commands while serve is running', async () => {
    await acquireServeLock(tempDir);

    await expect(assertServeNotRunning(tempDir)).rejects.toThrow(/serve is running/);
    await releaseServeLock(tempDir);
  });
});
