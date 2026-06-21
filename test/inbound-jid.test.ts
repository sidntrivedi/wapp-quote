import { describe, expect, it } from 'vitest';
import { shouldIgnoreInboundJid } from '../src/inbound-jid.js';

describe('shouldIgnoreInboundJid', () => {
  it('ignores group, personal, lid, and broadcast chats', () => {
    expect(shouldIgnoreInboundJid('120363361658284910@g.us')).toBe(true);
    expect(shouldIgnoreInboundJid('919956622300@s.whatsapp.net')).toBe(true);
    expect(shouldIgnoreInboundJid('236631424561329@lid')).toBe(true);
    expect(shouldIgnoreInboundJid('status@broadcast')).toBe(true);
  });

  it('does not ignore unknown service jids', () => {
    expect(shouldIgnoreInboundJid('123@hosted')).toBe(false);
  });

  it('ignores device-prefixed jids', () => {
    expect(shouldIgnoreInboundJid('0:919956622300@s.whatsapp.net')).toBe(true);
    expect(shouldIgnoreInboundJid('1:120363361658284910@g.us')).toBe(true);
  });
});
