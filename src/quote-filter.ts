const blockedTerms = [
  'मातम',
  'निराश',
  'हतोत्साह',
  'ख़ुदकुशी',
  'आत्महत्या',
  'बर्बाद',
  'बरबाद',
  'विलाप',
  'रोय',
  'मुआ',
  'व्यथा',
  'वीरां',
  'दम निकले',
  'दुश्वार',
  'दुःख',
  'दु:ख',
  'मरण',
  'मरन',
  'प्राण जाहिं',
  'मर जाता',
  'मरना',
  'मर गया',
  'नर्क',
  'भुगतता',
  'अकेले मर',
  'नुकसान',
  'नुक़सान',
  'हानि',
  'विपत्ति',
  'विपत्तिजनक',
  'नष्ट',
  'अकेला',
  'अकेले',
  'विरोध',
  'भंग',
  'धूर्त',
  'कपटी',
  'दुष्ट',
  'मूर्ख',
  'अपमान',
  'शोषण',
  'प्रतिकूल'
];

const positiveTerms = [
  'साहस',
  'प्रेम',
  'शांति',
  'शान्ति',
  'धैर्य',
  'आशा',
  'विश्वास',
  'प्रेरणा',
  'प्रयास',
  'कर्म',
  'ज्ञान',
  'सत्य',
  'दयालु',
  'दया',
  'भलाई',
  'मुस्कान',
  'खुशी',
  'आनंद',
  'आनन्द',
  'उन्नति',
  'सफल',
  'सफलता',
  'सीख',
  'मन',
  'जीवन',
  'सपना',
  'हिम्मत',
  'संयम',
  'सेवा',
  'विनम्र',
  'स्वभाव',
  'रोशनी',
  'रौशनी'
];

const unsuitableMorningTerms =
  /(राजनीति|सरकार|युद्ध|हत्या|अपराध|पाप|शराब|वासना|क्रोध|शत्रु|दंड|सज़ा|सजा|बीमारी|रोग|नफ़रत|नफरत|आत्महत्या|ख़ुदकुशी|खुदकुशी)/;

const classicalMetaTerms =
  /ISBN|https?:\/\/|श्रेणी:|विकिपीडिया|cite web|स्रोत:|यह कथन|बताता है|प्रकाश डालता है|कहा जाता है|लेखक ने लिखा|कहते हैं कि/i;

export function isSafeQuoteText(text: string): boolean {
  return !blockedTerms.some((term) => text.includes(term));
}

/** Hazardous content that should never be posted, even from Wikiquote. */
export function isHazardousQuoteText(text: string): boolean {
  if (!isSafeQuoteText(text)) {
    return true;
  }

  return unsuitableMorningTerms.test(text.trim());
}

/** Stricter filter for curated local quotes. */
export function isMorningSuitableQuoteText(text: string): boolean {
  if (!isSafeQuoteText(text)) {
    return false;
  }

  const normalized = text.trim();

  if (normalized.includes('?') || normalized.includes('？')) {
    return false;
  }

  if (/[A-Za-z]/.test(normalized)) {
    return false;
  }

  if (unsuitableMorningTerms.test(normalized)) {
    return false;
  }

  return positiveTerms.some((term) => hasPositiveTerm(normalized, term));
}

/** Permissive filter for sourced Wikiquote text: accept until hazardous. */
export function isClassicalQuoteText(text: string): boolean {
  const normalized = text.trim();

  if (normalized.length < 10 || normalized.length > 400) {
    return false;
  }

  if (isHazardousQuoteText(normalized)) {
    return false;
  }

  if (normalized.includes('?') || normalized.includes('？')) {
    return false;
  }

  if (/[A-Za-z]/.test(normalized)) {
    return false;
  }

  if (!/[ऀ-ॿ]/.test(normalized)) {
    return false;
  }

  if (/[{}[\]<>]/.test(normalized)) {
    return false;
  }

  if (classicalMetaTerms.test(normalized)) {
    return false;
  }

  if (normalized.startsWith('(') || normalized.startsWith('--')) {
    return false;
  }

  if (/^\[\[[^\]]+\]\](\s*\[\[[^\]]+\]\])?$/.test(normalized)) {
    return false;
  }

  return true;
}

export function getBlockedTerms(): string[] {
  return [...blockedTerms];
}

function hasPositiveTerm(text: string, term: string): boolean {
  if (term.length <= 2) {
    return hasHindiTerm(text, term);
  }

  return text.includes(term);
}

function hasHindiTerm(text: string, term: string): boolean {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^ऀ-ॿ])${escapedTerm}([^ऀ-ॿ]|$)`).test(text);
}
