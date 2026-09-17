import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { runCommand } from '../src/commands.js';
import { StateStore } from '../src/state-store.js';
import type { WhatsAppSender } from '../src/types.js';

describe('runCommand', () => {
  const tempDir = path.join(os.tmpdir(), `wapp-gita-cmd-${process.pid}`);
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createSender(overrides: Partial<WhatsAppSender> = {}): WhatsAppSender {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      ensureConnected: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
      listGroups: vi.fn().mockResolvedValue([]),
      isLoggedOut: vi.fn().mockReturnValue(false),
      ...overrides
    };
  }

  function stubGitaFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const match = String(url).match(/\/slok\/(\d+)\/(\d+)\//);
        const chapter = Number(match?.[1]);
        const verse = Number(match?.[2]);

        return new Response(
          JSON.stringify({
            chapter,
            verse,
            slok: verse === 1 ? 'धृतराष्ट्र उवाच' : 'सञ्जय उवाच',
            tej: { ht: verse === 1 ? 'धृतराष्ट्र ने पूछा।' : 'संजय ने कहा।' }
          })
        );
      })
    );
  }

  it('prints help text', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCommand({
      command: 'help',
      config: loadConfig({ DATA_DIR: tempDir }),
      logger: logger as never,
      sender: createSender(),
      stateStore: new StateStore(path.join(tempDir, 'state.json'))
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: npm run dev -- <command>'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('send-now'));
  });

  it('previews the next Gita shloka without sending', async () => {
    stubGitaFetch();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const stateStore = new StateStore(path.join(tempDir, 'state.json'));

    await runCommand({
      command: 'preview',
      config: loadConfig({ DATA_DIR: tempDir }),
      logger: logger as never,
      sender: createSender(),
      stateStore
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🕉️ श्रीमद्भगवद्गीता 1.1–1.2'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('सञ्जय उवाच'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('📖 भावार्थ:'));
  });

  it('send-now sends a Gita shloka when group jid is configured', async () => {
    stubGitaFetch();
    const sender = createSender();
    const stateStore = new StateStore(path.join(tempDir, 'state.json'));

    await runCommand({
      command: 'send-now',
      config: loadConfig({
        DATA_DIR: tempDir,
        WHATSAPP_GROUP_JID: '120363361658284910@g.us'
      }),
      logger: logger as never,
      sender,
      stateStore
    });

    expect(sender.connect).toHaveBeenCalledOnce();
    expect(sender.sendText).toHaveBeenCalledOnce();
    expect(sender.close).toHaveBeenCalledOnce();

    const state = await stateStore.load();
    expect(state.gitaCursor).toBe(2);
    expect(Object.keys(state.sentDates)).toHaveLength(1);
  });

  it('list-groups prints discovered groups', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sender = createSender({
      listGroups: vi.fn().mockResolvedValue([{ subject: 'Test Group', jid: '123@g.us', participants: 5 }])
    });

    await runCommand({
      command: 'list-groups',
      config: loadConfig({ DATA_DIR: tempDir }),
      logger: logger as never,
      sender,
      stateStore: new StateStore(path.join(tempDir, 'state.json'))
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test Group'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('123@g.us'));
    expect(sender.close).toHaveBeenCalledOnce();
  });

  it('reset-auth removes the saved auth directory', async () => {
    const authDir = path.join(tempDir, 'auth');
    await fs.mkdir(authDir, { recursive: true });
    await fs.writeFile(path.join(authDir, 'creds.json'), '{}', 'utf8');

    await runCommand({
      command: 'reset-auth',
      config: loadConfig({ DATA_DIR: tempDir, AUTH_DIR: authDir }),
      logger: logger as never,
      sender: createSender(),
      stateStore: new StateStore(path.join(tempDir, 'state.json'))
    });

    await expect(fs.stat(authDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(logger.info).toHaveBeenCalledWith({ authDir }, 'removed WhatsApp auth session');
  });
});
