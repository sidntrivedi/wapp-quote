/** Skip decrypting inbound chat traffic for a send-only quote bot. */
export function shouldIgnoreInboundJid(jid: string): boolean {
  const bare = jid.includes(':') ? jid.slice(jid.indexOf(':') + 1) : jid;

  return (
    bare.endsWith('@g.us') ||
    bare.endsWith('@lid') ||
    bare.endsWith('@s.whatsapp.net') ||
    bare.includes('@broadcast')
  );
}
