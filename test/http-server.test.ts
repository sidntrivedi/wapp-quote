import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAuthorized, processHealthWebhook, type HealthWebhookConfig } from '../src/http-server.js';
import { HealthStore } from '../src/health-store.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

const config: HealthWebhookConfig = {
  healthWebhookToken: 'secret-token',
  healthStepGoal: 8000,
  healthSleepGoalHours: 6,
  timeZone: 'Asia/Kolkata'
};

function createSender() {
  return {
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' })
  };
}

describe('isAuthorized', () => {
  it('accepts a matching bearer token', () => {
    expect(isAuthorized({ headers: { authorization: 'Bearer secret-token' } }, 'secret-token')).toBe(true);
  });

  it('accepts a matching x-webhook-token header', () => {
    expect(isAuthorized({ headers: { 'x-webhook-token': 'secret-token' } }, 'secret-token')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isAuthorized({ headers: { authorization: 'Bearer nope' } }, 'secret-token')).toBe(false);
  });

  it('rejects when no token is configured', () => {
    expect(isAuthorized({ headers: { authorization: 'Bearer anything' } }, '')).toBe(false);
  });
});

describe('processHealthWebhook', () => {
  const tempDir = path.join(os.tmpdir(), `wapp-quote-webhook-${process.pid}`);
  const filePath = path.join(tempDir, 'health.json');
  const groupJid = '120363361658284910@g.us';
  const groupJids = [groupJid];

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('stores the entry and posts to WhatsApp', async () => {
    const sender = createSender();
    const healthStore = new HealthStore(filePath);

    const result = await processHealthWebhook({
      rawBody: { date: '2026-06-21', steps: 9000, sleepSeconds: 27000 },
      force: false,
      config,
      logger: logger as never,
      sender,
      healthStore,
      groupJids,
      now: new Date('2026-06-21T16:00:00Z')
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'sent', date: '2026-06-21', posted: true });
    expect(result.body.results).toEqual([{ jid: groupJid, messageId: 'msg-1' }]);
    expect(sender.sendText).toHaveBeenCalledOnce();
    expect(sender.sendText.mock.calls[0][0]).toBe(groupJid);
    expect(sender.sendText.mock.calls[0][1]).toContain('👟 Steps: 9,000 / 8,000');
    expect(sender.sendText.mock.calls[0][1]).toContain('😴 Sleep: 7.5h / 6h ✅');

    const state = await healthStore.load();
    expect(state.entries['2026-06-21'].sleepHours).toBe(7.5);
    expect(state.entries['2026-06-21'].postedAt).toBeDefined();
    expect(state.entries['2026-06-21'].messageId).toBe('msg-1');
    expect(state.entries['2026-06-21'].messageIds).toEqual({ [groupJid]: 'msg-1' });
  });

  it('posts to multiple groups and records a messageId per group', async () => {
    const sender = createSender();
    sender.sendText.mockImplementation((jid: string) => Promise.resolve({ messageId: `msg-${jid}` }));
    const healthStore = new HealthStore(filePath);
    const secondJid = '120363999999999999@g.us';

    const result = await processHealthWebhook({
      rawBody: { date: '2026-06-21', steps: 9000 },
      force: false,
      config,
      logger: logger as never,
      sender,
      healthStore,
      groupJids: [groupJid, secondJid],
      now: new Date('2026-06-21T16:00:00Z')
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'sent', posted: true });
    expect(sender.sendText).toHaveBeenCalledTimes(2);
    expect(sender.sendText.mock.calls.map((call) => call[0])).toEqual([groupJid, secondJid]);

    const state = await healthStore.load();
    expect(state.entries['2026-06-21'].messageIds).toEqual({
      [groupJid]: `msg-${groupJid}`,
      [secondJid]: `msg-${secondJid}`
    });
  });

  it('posts to the remaining group when one group fails and reports the failure', async () => {
    const sender = createSender();
    const secondJid = '120363999999999999@g.us';
    sender.sendText.mockImplementation((jid: string) =>
      jid === secondJid ? Promise.reject(new Error('send failed')) : Promise.resolve({ messageId: 'msg-1' })
    );
    const healthStore = new HealthStore(filePath);

    const result = await processHealthWebhook({
      rawBody: { date: '2026-06-21', steps: 9000 },
      force: false,
      config,
      logger: logger as never,
      sender,
      healthStore,
      groupJids: [groupJid, secondJid],
      now: new Date('2026-06-21T16:00:00Z')
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'sent', posted: true });
    expect(result.body.results).toEqual([
      { jid: groupJid, messageId: 'msg-1' },
      { jid: secondJid, error: 'send failed' }
    ]);

    const state = await healthStore.load();
    expect(state.entries['2026-06-21'].postedAt).toBeDefined();
    expect(state.entries['2026-06-21'].messageIds).toEqual({ [groupJid]: 'msg-1' });
  });

  it('throws when all groups fail to receive the message', async () => {
    const sender = createSender();
    sender.sendText.mockRejectedValue(new Error('send failed'));
    const healthStore = new HealthStore(filePath);

    await expect(
      processHealthWebhook({
        rawBody: { date: '2026-06-21', steps: 9000 },
        force: false,
        config,
        logger: logger as never,
        sender,
        healthStore,
        groupJids: [groupJid],
        now: new Date('2026-06-21T16:00:00Z')
      })
    ).rejects.toThrow('send failed');

    const state = await healthStore.load();
    expect(state.entries['2026-06-21'].postedAt).toBeUndefined();
  });

  it('returns 400 for an invalid payload', async () => {
    const sender = createSender();
    const result = await processHealthWebhook({
      rawBody: { notes: 'x'.repeat(501) },
      force: false,
      config,
      logger: logger as never,
      sender,
      healthStore: new HealthStore(filePath),
      groupJids
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid_payload');
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('does not repost when already posted today', async () => {
    const sender = createSender();
    const healthStore = new HealthStore(filePath);
    const now = new Date('2026-06-21T16:00:00Z');

    await processHealthWebhook({ rawBody: { date: '2026-06-21', steps: 9000 }, force: false, config, logger: logger as never, sender, healthStore, groupJids, now });
    expect(sender.sendText).toHaveBeenCalledOnce();

    const second = await processHealthWebhook({
      rawBody: { date: '2026-06-21', steps: 9500 },
      force: false,
      config,
      logger: logger as never,
      sender,
      healthStore,
      groupJids,
      now
    });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ status: 'stored', posted: false, reason: 'already_posted' });
    expect(sender.sendText).toHaveBeenCalledOnce();

    // The refined steps value is still persisted.
    const state = await healthStore.load();
    expect(state.entries['2026-06-21'].steps).toBe(9500);
  });

  it('reposts when force=true', async () => {
    const sender = createSender();
    const healthStore = new HealthStore(filePath);
    const now = new Date('2026-06-21T16:00:00Z');

    await processHealthWebhook({ rawBody: { date: '2026-06-21', steps: 9000 }, force: false, config, logger: logger as never, sender, healthStore, groupJids, now });
    const forced = await processHealthWebhook({ rawBody: { date: '2026-06-21', steps: 9000 }, force: true, config, logger: logger as never, sender, healthStore, groupJids, now });

    expect(forced.body).toMatchObject({ status: 'sent', posted: true });
    expect(sender.sendText).toHaveBeenCalledTimes(2);
  });

  it('computes a step-goal streak across stored days', async () => {
    const sender = createSender();
    const healthStore = new HealthStore(filePath);

    await processHealthWebhook({ rawBody: { date: '2026-06-20', steps: 8500 }, force: false, config, logger: logger as never, sender, healthStore, groupJids, now: new Date('2026-06-20T16:00:00Z') });
    await processHealthWebhook({ rawBody: { date: '2026-06-21', steps: 9000 }, force: false, config, logger: logger as never, sender, healthStore, groupJids, now: new Date('2026-06-21T16:00:00Z') });

    const lastMessage = sender.sendText.mock.calls[1][1] as string;
    expect(lastMessage).toContain('Streak: 2 days');
  });
});
