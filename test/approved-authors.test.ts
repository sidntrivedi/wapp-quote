import { describe, expect, it } from 'vitest';
import { approvedWikiquotePages, formatApprovedWikiquotePages } from '../src/approved-authors.js';

describe('approvedWikiquotePages', () => {
  it('includes expected authors with Wikiquote page title mappings', () => {
    const kabir = approvedWikiquotePages.find((entry) => entry.author === 'कबीर');
    const tagore = approvedWikiquotePages.find((entry) => entry.author === 'रवीन्द्रनाथ टैगोर');
    const gandhi = approvedWikiquotePages.find((entry) => entry.author === 'महात्मा गांधी');

    expect(kabir).toEqual({ page: 'कबीर', author: 'कबीर' });
    expect(tagore).toEqual({ page: 'रबीन्द्रनाथ टैगोर', author: 'रवीन्द्रनाथ टैगोर' });
    expect(gandhi).toEqual({ page: 'मोहनदास करमचंद गांधी', author: 'महात्मा गांधी' });
  });
});

describe('formatApprovedWikiquotePages', () => {
  it('serializes pages as page|author pairs', () => {
    const formatted = formatApprovedWikiquotePages();

    expect(formatted.startsWith('कबीर|कबीर,')).toBe(true);
    expect(formatted.split(',').length).toBe(approvedWikiquotePages.length);
  });
});
