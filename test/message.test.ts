import { describe, expect, it } from 'vitest';
import { renderGitaMessage } from '../src/message.js';

describe('renderGitaMessage', () => {
  it('renders a Gita shloka and Hindi meaning only', () => {
    const message = renderGitaMessage({
      kind: 'gita',
      id: 'gita-01-001',
      label: 'भगवद्गीता 1.1',
      chapter: 1,
      verse: 1,
      sanskrit: 'धृतराष्ट्र उवाच',
      hindiMeaning: 'धृतराष्ट्र ने पूछा।'
    });

    expect(message).toContain('🌅 सुप्रभात');
    expect(message).toContain('🕉️ श्रीमद्भगवद्गीता 1.1');
    expect(message).toContain('धृतराष्ट्र उवाच');
    expect(message).toContain('📖 भावार्थ:');
    expect(message).toContain('धृतराष्ट्र ने पूछा।');
    expect(message).not.toContain('आज की दिशा');
  });
});
