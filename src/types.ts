export type GitaVerse = {
  kind: 'gita';
  id: string;
  chapter: number;
  verse: number;
  sanskrit: string;
  hindiMeaning: string;
  label: string;
  sourceLabel?: string;
};

export type SentGitaEntry = {
  verseId: string;
  label: string;
  sentAt: string;
  messageId?: string;
};

export type BotState = {
  /** Zero-based Bhagavad Gita sequence cursor. 0 means Chapter 1, Verse 1. */
  gitaCursor: number;
  sentDates: Record<string, SentGitaEntry>;
};

export type SendResult = {
  messageId?: string;
};

export interface WhatsAppSender {
  connect(): Promise<void>;
  ensureConnected(): Promise<void>;
  isConnected(): boolean;
  isLoggedOut(): boolean;
  close(): Promise<void>;
  sendText(jid: string, text: string): Promise<SendResult>;
  listGroups(): Promise<Array<{ jid: string; subject: string; participants: number }>>;
}
