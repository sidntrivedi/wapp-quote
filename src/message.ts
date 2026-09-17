import type { GitaVerse } from './types.js';

export function renderGitaMessage(verse: GitaVerse): string {
  return [
    '🌅 सुप्रभात',
    '',
    `🕉️ श्रीमद्भगवद्गीता ${verse.chapter}.${verse.verse}`,
    verse.sanskrit,
    '',
    '📖 भावार्थ:',
    verse.hindiMeaning
  ].join('\n');
}
