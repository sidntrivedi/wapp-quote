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
  /(राजनीति|सरकार|युद्ध|हत्या|अपराध|पाप|शराब|वासना|क्रोध|शत्रु|दंड|सज़ा|सजा|बीमारी|रोग|नफ़रत|नफरत|धन|पैसा|नारी|स्त्री)/;

export function isSafeQuoteText(text: string): boolean {
  return !blockedTerms.some((term) => text.includes(term));
}

export function isMorningSuitableQuoteText(text: string): boolean {
  if (!isSafeQuoteText(text)) {
    return false;
  }

  const normalized = text.trim();

  if (normalized.includes('?') || normalized.includes('？')) {
    return false;
  }

  if (/['A-Za-zऽॐ॥]/.test(normalized)) {
    return false;
  }

  if (unsuitableMorningTerms.test(normalized)) {
    return false;
  }

  return positiveTerms.some((term) => hasHindiTerm(normalized, term));
}

export function getBlockedTerms(): string[] {
  return [...blockedTerms];
}

function hasHindiTerm(text: string, term: string): boolean {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^ऀ-ॿ])${escapedTerm}([^ऀ-ॿ]|$)`).test(text);
}
