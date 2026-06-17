import type { Quote } from './types.js';

export function renderQuoteMessage(quote: Quote): string {
  return [
    '🌅 सुप्रभात',
    '',
    '✨ आज की पंक्ति',
    `“${quote.text}”`,
    `— ${quote.author}`,
    '',
    `🌿 आज की दिशा: ${quote.reflection}`
  ].join('\n');
}
