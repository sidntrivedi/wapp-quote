import { describe, expect, it } from 'vitest';
import { loadConfig, requireGroupJid } from '../src/config.js';

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
});
