import fs from 'node:fs/promises';
import process from 'node:process';

export function serveLockPath(dataDir: string): string {
  return `${dataDir}/serve.lock`;
}

export async function acquireServeLock(dataDir: string): Promise<void> {
  const path = serveLockPath(dataDir);
  await fs.mkdir(dataDir, { recursive: true });

  try {
    const existing = await fs.readFile(path, 'utf8');
    const [pidText, startedAt] = existing.trim().split('\n');
    const pid = Number(pidText);
    if (pid && isProcessAlive(pid)) {
      throw new Error(
        `serve is already running (pid ${pid}, started ${startedAt ?? 'unknown'}). ` +
          'Stop it before running this command, or use `fly machine restart` after re-pairing.'
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.writeFile(path, `${process.pid}\n${new Date().toISOString()}\n`, 'utf8');
}

export async function releaseServeLock(dataDir: string): Promise<void> {
  const path = serveLockPath(dataDir);
  try {
    const existing = await fs.readFile(path, 'utf8');
    const pid = Number(existing.split('\n')[0]);
    if (pid === process.pid) {
      await fs.rm(path, { force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function assertServeNotRunning(dataDir: string): Promise<void> {
  const path = serveLockPath(dataDir);
  try {
    const existing = await fs.readFile(path, 'utf8');
    const [pidText, startedAt] = existing.trim().split('\n');
    const pid = Number(pidText);
    if (pid && isProcessAlive(pid)) {
      throw new Error(
        `serve is running (pid ${pid}, started ${startedAt ?? 'unknown'}). ` +
          'One-shot commands steal the WhatsApp session and break the daily scheduler. ' +
          'Use `fly machine restart` after re-pairing instead of send-now while serve is up.'
      );
    }

    await fs.rm(path, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
