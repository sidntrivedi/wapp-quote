export type Quote = {
  id: string;
  text: string;
  author: string;
  language: 'hi' | 'ur';
  mood: 'inspirational' | 'wisdom' | 'devotional' | 'hopeful';
  reflection: string;
  source?: string;
};

export type BotState = {
  rotationIndex: number;
  usedQuoteIds: string[];
  sentDates: Record<string, { quoteId: string; author: string; sentAt: string; messageId?: string }>;
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
