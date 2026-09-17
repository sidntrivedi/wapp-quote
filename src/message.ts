import type { GitaVerseBatch } from './types.js';

export function renderGitaMessage(batch: GitaVerseBatch): string {
  return [
    '🌅 सुप्रभात',
    '',
    `🕉️ श्रीमद्भगवद्गीता ${batch.label.replace(/^भगवद्गीता\s+/, '')}`,
    batch.verses.map((verse) => verse.sanskrit).join('\n\n'),
    '',
    '📖 भावार्थ:',
    batch.verses.map((verse) => `${verse.chapter}.${verse.verse} — ${verse.hindiMeaning}`).join('\n\n')
  ].join('\n');
}
