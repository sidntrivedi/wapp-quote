import { describe, expect, it } from 'vitest';
import { getBlockedTerms, isMorningSuitableQuoteText, isSafeQuoteText } from '../src/quote-filter.js';

describe('isSafeQuoteText', () => {
  it('accepts uplifting Hindi text', () => {
    expect(isSafeQuoteText('धैर्य और प्रेम से जीवन सुंदर बनता है।')).toBe(true);
  });

  it('rejects text containing blocked terms', () => {
    expect(isSafeQuoteText('दुःख में सुमिरन सब करे।')).toBe(false);
    expect(isSafeQuoteText('मरण से पहले सत्य जानो।')).toBe(false);
  });
});

describe('isMorningSuitableQuoteText', () => {
  it('accepts safe Hindi quotes with positive terms', () => {
    expect(isMorningSuitableQuoteText('धैर्य और प्रेम से जीवन सुंदर बनता है।')).toBe(true);
    expect(isMorningSuitableQuoteText('ज्ञान और सत्य से मन में रोशनी आती है।')).toBe(true);
  });

  it('rejects unsafe, political, or non-Hindi text', () => {
    expect(isMorningSuitableQuoteText('दुःख में सुमिरन सब करे।')).toBe(false);
    expect(isMorningSuitableQuoteText('राजनीति पर यह एक टिप्पणी है।')).toBe(false);
    expect(isMorningSuitableQuoteText('What is wisdom?')).toBe(false);
    expect(isMorningSuitableQuoteText('क्या जीवन सुंदर है?')).toBe(false);
  });

  it('requires positive terms as whole Hindi words', () => {
    expect(isMorningSuitableQuoteText('यह एक सामान्य वाक्य है बिना उत्साह के।')).toBe(false);
  });
});

describe('getBlockedTerms', () => {
  it('returns a copy of the blocked term list', () => {
    const terms = getBlockedTerms();
    expect(terms.length).toBeGreaterThan(0);
    expect(terms).toContain('दुःख');
    terms.push('test');
    expect(getBlockedTerms()).not.toContain('test');
  });
});
