import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { requirePairingPhoneNumber } from './config.js';
import type { SendResult, WhatsAppSender } from './types.js';

type ConnectionStatus = 'connecting' | 'open' | 'closed';

export class BaileysWhatsAppSender implements WhatsAppSender {
  private socket?: WASocket;
  private status: ConnectionStatus = 'closed';
  private closeReason?: Error;
  private pairingCodeRequested = false;
  private reconnecting = false;
  private closingIntentionally = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {}

  async connect(): Promise<void> {
    if (this.status === 'open' && this.socket) {
      return;
    }

    await this.resetAuthOnceIfRequested();
    await fs.mkdir(this.config.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.status = 'connecting';
    this.closeReason = undefined;
    this.pairingCodeRequested = false;
    this.closingIntentionally = false;

    const socket = makeWASocket({
      version,
      printQRInTerminal: false,
      browser: Browsers.macOS('Wapp Quote'),
      logger: this.logger.child({ module: 'baileys' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger)
      }
    });

    this.socket = socket;
    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', (update) => {
      if (update.qr) {
        if (this.config.authMethod === 'qr') {
          qrcode.generate(update.qr, { small: true });
          void this.writeQrFile(update.qr);
        } else if (!this.pairingCodeRequested && !socket.authState.creds.registered) {
          this.pairingCodeRequested = true;
          void this.printPairingCode(socket);
        }
      }

      if (update.connection === 'open') {
        this.status = 'open';
        this.logger.info('whatsapp connection open');
      }

      if (update.connection === 'close') {
        this.status = 'closed';
        const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        const isConflict = code === 440;
        const shouldReconnect = code !== DisconnectReason.loggedOut && !isConflict;
        const message = shouldReconnect
          ? `WhatsApp connection closed; reconnecting. Code: ${code ?? 'unknown'}`
          : isConflict
            ? 'WhatsApp connection conflict: another bot process or linked Web session replaced this connection. Stop other bot processes, then retry.'
          : 'WhatsApp logged out. Run `npm run dev -- reset-auth`, then `npm run dev -- pair`.';
        if (this.closingIntentionally) {
          return;
        }

        this.logger.warn({ code, shouldReconnect }, message);

        if (shouldReconnect) {
          void this.reconnect();
        } else {
          this.closeReason = new Error(message);
        }
      }
    });

    await this.waitForOpen();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      this.socket = undefined;
      await this.connect();
    } catch (error) {
      this.closeReason = error instanceof Error ? error : new Error(String(error));
      this.logger.error({ error }, 'WhatsApp reconnect failed');
    } finally {
      this.reconnecting = false;
    }
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }

    this.closingIntentionally = true;

    try {
      this.socket.end(undefined);
    } finally {
      this.socket = undefined;
      this.status = 'closed';
    }
  }

  async sendText(jid: string, text: string): Promise<SendResult> {
    const socket = this.requireSocket();
    const response = await socket.sendMessage(jid, { text });
    return { messageId: response?.key.id ?? undefined };
  }

  async listGroups(): Promise<Array<{ jid: string; subject: string; participants: number }>> {
    const socket = this.requireSocket();
    const groups = await socket.groupFetchAllParticipating();

    return Object.values(groups)
      .map((group) => ({
        jid: group.id,
        subject: group.subject,
        participants: group.participants.length
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }

  private requireSocket(): WASocket {
    if (!this.socket || this.status !== 'open') {
      throw new Error('WhatsApp socket is not connected.');
    }

    return this.socket;
  }

  private async waitForOpen(timeoutMs = 120_000): Promise<void> {
    const startedAt = Date.now();

    while (this.status !== 'open') {
      if (this.closeReason) {
        throw this.closeReason;
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Timed out waiting for WhatsApp connection.');
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private async printPairingCode(socket: WASocket): Promise<void> {
    try {
      const phoneNumber = requirePairingPhoneNumber(this.config);
      const code = await socket.requestPairingCode(phoneNumber);
      console.log(`Pairing code for ${phoneNumber}: ${formatPairingCode(code)}`);
      console.log('Open WhatsApp > Linked devices > Link with phone number, then enter this code.');
    } catch (error) {
      this.closeReason = error instanceof Error ? error : new Error(String(error));
      this.logger.error({ error }, 'failed to request WhatsApp pairing code');
    }
  }

  private async writeQrFile(qr: string): Promise<void> {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      const qrPath = path.join(this.config.dataDir, 'pairing-qr.svg');
      await QRCode.toFile(qrPath, qr, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 512
      });
      console.log(`QR image written to: ${qrPath}`);
      console.log('Open that SVG and scan it from WhatsApp > Linked devices > Link a device.');
    } catch (error) {
      this.logger.warn({ error }, 'failed to write pairing QR image');
    }
  }

  private async resetAuthOnceIfRequested(): Promise<void> {
    if (!this.config.resetAuthOnStart) {
      return;
    }

    await fs.mkdir(this.config.dataDir, { recursive: true });
    const markerName = this.config.resetAuthToken
      ? `reset-auth-on-start-${this.config.resetAuthToken.replace(/[^a-zA-Z0-9._-]/g, '_')}.done`
      : 'reset-auth-on-start.done';
    const markerPath = path.join(this.config.dataDir, markerName);

    try {
      await fs.access(markerPath);
      return;
    } catch {
      await fs.rm(this.config.authDir, { recursive: true, force: true });
      await fs.writeFile(markerPath, new Date().toISOString(), 'utf8');
      this.logger.warn({ authDir: this.config.authDir, markerPath }, 'reset WhatsApp auth once on startup');
    }
  }
}

function formatPairingCode(code: string): string {
  return code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}
