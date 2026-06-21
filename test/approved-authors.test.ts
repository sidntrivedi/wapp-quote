import { describe, expect, it } from 'vitest';
import { approvedWikiquotePages, formatApprovedWikiquotePages } from '../src/approved-authors.js';

describe('approvedWikiquotePages', () => {
  it('includes expected authors with matching page and author names', () => {
    const kabir = approvedWikiquotePages.find((entry) => entry.author === 'कबीर');
    const tagore = approvedWikiquotePages.find((entry) => entry.author === 'रवीन्द्रनाथ टैगोर');

    expect(kabir).toEqual({ page: 'कबीर', author: 'कबीर' });
    expect(tagore).toEqual({ page: 'रवीन्द्रनाथ टैगोर', author: 'रवीन्द्रनाथ टैगोर' });
  });
});

describe('formatApprovedWikiquotePages', () => {
  it('serializes pages as page|author pairs', () => {
    const formatted = formatApprovedWikiquotePages();

    expect(formatted.startsWith('कबीर|कबीर,')).toBe(true);
    expect(formatted.split(',').length).toBe(approvedWikiquotePages.length);
  });
});
