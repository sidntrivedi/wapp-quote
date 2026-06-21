/** Skip decrypting inbound chat traffic for a send-only quote bot. */
export function shouldIgnoreInboundJid(jid: string): boolean {
  const bare = jid.split(':')[0] ?? jid;

  return (
    bare.endsWith('@g.us') ||
    bare.endsWith('@lid') ||
    bare.endsWith('@s.whatsapp.net') ||
    bare.includes('@broadcast')
  );
}
