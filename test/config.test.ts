import { describe, expect, it } from 'vitest';
import { loadConfig, requireGroupJid, requireHealthGroupJids, requirePairingPhoneNumber, validateHealthEnvironment } from '../src/config.js';

describe('config', () => {
  it('loads Gita defaults', () => {
    const config = loadConfig({});

    expect(config.gitaApiBaseUrl).toBe('https://vedicscriptures.github.io');
    expect(config.gitaApiTimeoutMs).toBe(10000);
    expect(config.gitaHindiField).toBe('tej.ht');
    expect(config.gitaTime).toBe('06:00');
    expect(config.gitaCatchUp).toBe(true);
    expect(config.timeZone).toBe('Asia/Kolkata');
    expect(config.authMethod).toBe('pairing');
  });

  it('parses Gita env vars', () => {
    const config = loadConfig({
      GITA_API_BASE_URL: 'https://example.com/api/',
      GITA_API_TIMEOUT_MS: '15000',
      GITA_HINDI_FIELD: 'custom.meaning',
      GITA_TIME: '05:30',
      GITA_CATCH_UP: 'false'
    });

    expect(config.gitaApiBaseUrl).toBe('https://example.com/api');
    expect(config.gitaApiTimeoutMs).toBe(15000);
    expect(config.gitaHindiField).toBe('custom.meaning');
    expect(config.gitaTime).toBe('05:30');
    expect(config.gitaCatchUp).toBe(false);
  });

  it('rejects missing group jid when sending is required', () => {
    expect(() => requireGroupJid(loadConfig({}))).toThrow(/WHATSAPP_GROUP_JID/);
  });

  it('rejects non-group jid values', () => {
    expect(() => requireGroupJid(loadConfig({ WHATSAPP_GROUP_JID: '919999999999@s.whatsapp.net' }))).toThrow(/@g\.us/);
  });

  it('parses RESET_AUTH_ON_START from env strings', () => {
    expect(loadConfig({ RESET_AUTH_ON_START: 'false' }).resetAuthOnStart).toBe(false);
    expect(loadConfig({ RESET_AUTH_ON_START: 'true' }).resetAuthOnStart).toBe(true);
  });

  it('resolves data, auth, and state paths from DATA_DIR', () => {
    const config = loadConfig({ DATA_DIR: './custom-data' });

    expect(config.dataDir).toMatch(/custom-data$/);
    expect(config.authDir).toMatch(/custom-data\/auth$/);
    expect(config.stateFile).toMatch(/custom-data\/state\.json$/);
  });

  it('requires a pairing phone number only for pairing auth', () => {
    const pairingConfig = loadConfig({ AUTH_METHOD: 'pairing' });
    const qrConfig = loadConfig({ AUTH_METHOD: 'qr' });

    expect(() => requirePairingPhoneNumber(pairingConfig)).toThrow(/PAIRING_PHONE_NUMBER/);
    expect(() => requirePairingPhoneNumber(qrConfig)).toThrow(/AUTH_METHOD=pairing/);
    expect(requirePairingPhoneNumber(loadConfig({ AUTH_METHOD: 'pairing', PAIRING_PHONE_NUMBER: '919999999999' }))).toBe(
      '919999999999'
    );
  });

  it('accepts a valid group jid', () => {
    expect(requireGroupJid(loadConfig({ WHATSAPP_GROUP_JID: '120363361658284910@g.us' }))).toBe(
      '120363361658284910@g.us'
    );
  });

  it('loads health webhook defaults (disabled)', () => {
    const config = loadConfig({});
    expect(config.healthWebhookEnabled).toBe(false);
    expect(config.healthWebhookPort).toBe(8080);
    expect(config.healthStepGoal).toBe(9000);
    expect(config.healthSleepGoalHours).toBe(7);
    expect(config.healthStateFile).toMatch(/health\.json$/);
  });

  it('parses health webhook env vars', () => {
    const config = loadConfig({
      HEALTH_WEBHOOK_ENABLED: 'true',
      HEALTH_WEBHOOK_PORT: '9090',
      HEALTH_WEBHOOK_TOKEN: 'secret',
      HEALTH_GROUP_JID: '120363361658284910@g.us',
      HEALTH_STEP_GOAL: '10000',
      HEALTH_SLEEP_GOAL_HOURS: '7'
    });

    expect(config.healthWebhookEnabled).toBe(true);
    expect(config.healthWebhookPort).toBe(9090);
    expect(config.healthWebhookToken).toBe('secret');
    expect(config.healthStepGoal).toBe(10000);
    expect(config.healthSleepGoalHours).toBe(7);
  });

  it('validateHealthEnvironment is a no-op when disabled', () => {
    expect(() => validateHealthEnvironment(loadConfig({}))).not.toThrow();
  });

  it('validateHealthEnvironment requires a token when enabled', () => {
    expect(() =>
      validateHealthEnvironment(
        loadConfig({ HEALTH_WEBHOOK_ENABLED: 'true', HEALTH_GROUP_JID: '120363361658284910@g.us' })
      )
    ).toThrow(/HEALTH_WEBHOOK_TOKEN/);
  });

  it('validateHealthEnvironment requires a group jid when enabled', () => {
    expect(() =>
      validateHealthEnvironment(loadConfig({ HEALTH_WEBHOOK_ENABLED: 'true', HEALTH_WEBHOOK_TOKEN: 'secret' }))
    ).toThrow(/HEALTH_GROUP_JID/);
  });

  it('validateHealthEnvironment passes with token and group jid', () => {
    expect(() =>
      validateHealthEnvironment(
        loadConfig({
          HEALTH_WEBHOOK_ENABLED: 'true',
          HEALTH_WEBHOOK_TOKEN: 'secret',
          HEALTH_GROUP_JID: '120363361658284910@g.us'
        })
      )
    ).not.toThrow();
  });

  it('requireHealthGroupJids falls back to WHATSAPP_GROUP_JID', () => {
    const config = loadConfig({ WHATSAPP_GROUP_JID: '120363361658284910@g.us' });
    expect(requireHealthGroupJids(config)).toEqual(['120363361658284910@g.us']);
  });

  it('requireHealthGroupJids parses a comma-separated HEALTH_GROUP_JID list', () => {
    const config = loadConfig({
      HEALTH_GROUP_JID: '120363111111111111@g.us, 120363222222222222@g.us'
    });
    expect(requireHealthGroupJids(config)).toEqual([
      '120363111111111111@g.us',
      '120363222222222222@g.us'
    ]);
  });

  it('requireHealthGroupJids rejects an invalid entry in the list', () => {
    const config = loadConfig({
      HEALTH_GROUP_JID: '120363111111111111@g.us,919999999999@s.whatsapp.net'
    });
    expect(() => requireHealthGroupJids(config)).toThrow(/@g\.us/);
  });

  it('requireHealthGroupJids throws when no group jid is configured', () => {
    expect(() => requireHealthGroupJids(loadConfig({}))).toThrow(/HEALTH_GROUP_JID/);
  });
});
