import { describe, expect, it } from 'vitest';
import { loadConfig, requireGroupJid, requirePairingPhoneNumber } from '../src/config.js';

describe('config', () => {
  it('loads defaults', () => {
    const config = loadConfig({});

    expect(config.quoteTime).toBe('06:00');
    expect(config.timeZone).toBe('Asia/Kolkata');
    expect(config.authMethod).toBe('pairing');
    expect(config.wikiquoteMode).toBe('pages');
    expect(config.wikiquotePages.length).toBeGreaterThan(40);
    expect(config.wikiquotePages[0]).toEqual({ page: 'कबीर', author: 'कबीर' });
    expect(config.wikiquotePages.map((page) => page.author)).toContain('रवीन्द्रनाथ टैगोर');
    expect(config.wikiquotePages.map((page) => page.author)).toContain('नेल्सन मंडेला');
    expect(config.wikiquotePages.map((page) => page.author)).toContain('अल्बर्ट आइंस्टीन');
  });

  it('rejects missing group jid when sending is required', () => {
    expect(() => requireGroupJid(loadConfig({}))).toThrow(/WHATSAPP_GROUP_JID/);
  });

  it('rejects non-group jid values', () => {
    expect(() => requireGroupJid(loadConfig({ WHATSAPP_GROUP_JID: '919999999999@s.whatsapp.net' }))).toThrow(/@g\.us/);
  });

  it('parses QUOTE_CATCH_UP=false from env strings', () => {
    expect(loadConfig({ QUOTE_CATCH_UP: 'false' }).quoteCatchUp).toBe(false);
    expect(loadConfig({ QUOTE_CATCH_UP: 'true' }).quoteCatchUp).toBe(true);
    expect(loadConfig({}).quoteCatchUp).toBe(true);
  });

  it('parses RESET_AUTH_ON_START=false from env strings', () => {
    expect(loadConfig({ RESET_AUTH_ON_START: 'false' }).resetAuthOnStart).toBe(false);
    expect(loadConfig({ RESET_AUTH_ON_START: 'true' }).resetAuthOnStart).toBe(true);
  });

  it('parses custom wikiquote pages and categories', () => {
    const config = loadConfig({
      WIKIQUOTE_PAGES: 'कबीर|कबीर,रहीम',
      WIKIQUOTE_CATEGORIES: 'श्रेणी:लेखक, दार्शनिक'
    });

    expect(config.wikiquotePages).toEqual([
      { page: 'कबीर', author: 'कबीर' },
      { page: 'रहीम', author: 'रहीम' }
    ]);
    expect(config.wikiquoteCategories).toEqual(['लेखक', 'दार्शनिक']);
  });

  it('rejects invalid wikiquote page entries', () => {
    expect(() => loadConfig({ WIKIQUOTE_PAGES: '|missing-page' })).toThrow(/Invalid WIKIQUOTE_PAGES entry/);
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
});
