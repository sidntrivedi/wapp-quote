import { describe, expect, it } from 'vitest';
import { getBlockedTerms, isClassicalQuoteText, isHazardousQuoteText, isMorningSuitableQuoteText, isSafeQuoteText } from '../src/quote-filter.js';

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

describe('isClassicalQuoteText', () => {
  it('accepts short sourced dohas without an explicit positive keyword', () => {
    expect(isClassicalQuoteText('धीरे-धीरे रे मना, धीरे सब कुछ होय ।')).toBe(true);
    expect(isClassicalQuoteText('बड़ा हुआ तो क्या हुआ, जैसे पेड़ खजूर।')).toBe(true);
    expect(isClassicalQuoteText('मेरे तो गिरधर गोपाल, दूसरो न कोई।')).toBe(true);
  });

  it('rejects commentary and unsafe classical text', () => {
    expect(isClassicalQuoteText('दुःख में सुमिरन सब करे सुख में करे न कोय।')).toBe(false);
    expect(isClassicalQuoteText('यह कथन विचारों की शक्ति पर प्रकाश डालता है।')).toBe(false);
    expect(isClassicalQuoteText('राजनीति पर यह एक टिप्पणी है।')).toBe(false);
  });
});

describe('isHazardousQuoteText', () => {
  it('flags blocked and politically unsafe content', () => {
    expect(isHazardousQuoteText('दुःख में सुमिरन सब करे।')).toBe(true);
    expect(isHazardousQuoteText('राजनीति पर यह एक टिप्पणी है।')).toBe(true);
    expect(isHazardousQuoteText('धैर्य और प्रेम से जीवन सुंदर बनता है।')).toBe(false);
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
