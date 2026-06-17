import { describe, expect, it } from 'vitest';
import { renderQuoteMessage } from '../src/message.js';
import type { Quote } from '../src/types.js';

describe('renderQuoteMessage', () => {
  it('renders the quote, author, and reflection', () => {
    const quote: Quote = {
      id: 'q1',
      text: 'धीरे-धीरे रे मना',
      author: 'कबीर',
      language: 'hi',
      mood: 'hopeful',
      reflection: 'धैर्य रखिए।'
    };

    expect(renderQuoteMessage(quote)).toContain('🌅 सुप्रभात');
    expect(renderQuoteMessage(quote)).toContain('“धीरे-धीरे रे मना”');
    expect(renderQuoteMessage(quote)).toContain('— कबीर');
    expect(renderQuoteMessage(quote)).toContain('🌿 आज की दिशा: धैर्य रखिए।');
  });
});
