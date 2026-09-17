import { describe, expect, it } from 'vitest';
import { renderGitaMessage } from '../src/message.js';
import type { GitaVerseBatch } from '../src/types.js';

const batch: GitaVerseBatch = {
  kind: 'gita-batch',
  id: 'gita-01-001--gita-01-002',
  verseIds: ['gita-01-001', 'gita-01-002'],
  label: 'भगवद्गीता 1.1–1.2',
  verses: [
    {
      kind: 'gita',
      id: 'gita-01-001',
      label: 'भगवद्गीता 1.1',
      chapter: 1,
      verse: 1,
      sanskrit: 'धृतराष्ट्र उवाच',
      hindiMeaning: 'धृतराष्ट्र ने पूछा।'
    },
    {
      kind: 'gita',
      id: 'gita-01-002',
      label: 'भगवद्गीता 1.2',
      chapter: 1,
      verse: 2,
      sanskrit: 'सञ्जय उवाच',
      hindiMeaning: 'संजय ने कहा।'
    }
  ]
};

describe('renderGitaMessage', () => {
  it('renders Sanskrit shlokas together and meanings below', () => {
    const message = renderGitaMessage(batch);

    expect(message).toContain('🌅 सुप्रभात');
    expect(message).toContain('🕉️ श्रीमद्भगवद्गीता 1.1–1.2');
    expect(message).toContain('धृतराष्ट्र उवाच\n\nसञ्जय उवाच');
    expect(message).toContain('📖 भावार्थ:');
    expect(message).toContain('1.1 — धृतराष्ट्र ने पूछा।');
    expect(message).toContain('1.2 — संजय ने कहा।');
    expect(message).not.toContain('आज की दिशा');
  });
});
