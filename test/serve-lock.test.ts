import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireServeLock, assertServeNotRunning, releaseServeLock, serveLockPath } from '../src/serve-lock.js';

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

  it('reuses a stale lock left by a dead process', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(serveLockPath(tempDir), '999999999\n2026-01-01T00:00:00.000Z\n', 'utf8');

    await acquireServeLock(tempDir);
    await expect(fs.readFile(serveLockPath(tempDir), 'utf8')).resolves.toContain(String(process.pid));
    await releaseServeLock(tempDir);
  });

  it('cleans up stale locks for one-shot commands', async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(serveLockPath(tempDir), '999999999\n2026-01-01T00:00:00.000Z\n', 'utf8');

    await assertServeNotRunning(tempDir);
    await expect(fs.stat(serveLockPath(tempDir))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not remove a lock owned by another live process', async () => {
    await acquireServeLock(tempDir);

    const originalPid = process.pid;
    Object.defineProperty(process, 'pid', { value: originalPid + 1 });

    await releaseServeLock(tempDir);
    await expect(fs.readFile(serveLockPath(tempDir), 'utf8')).resolves.toContain(String(originalPid));

    Object.defineProperty(process, 'pid', { value: originalPid });
    await releaseServeLock(tempDir);
  });
});
