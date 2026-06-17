import { quoteBank } from '../quotes.js';
import { getBlockedTerms } from '../quote-filter.js';

const blockedTerms = getBlockedTerms();

let failures = 0;

for (const quote of quoteBank) {
  const text = `${quote.text} ${quote.reflection}`;

  for (const term of blockedTerms) {
    if (text.includes(term)) {
      failures += 1;
      console.error(`Quote ${quote.id} contains blocked term: ${term}`);
    }
  }

  if (!quote.text || !quote.author || !quote.reflection) {
    failures += 1;
    console.error(`Quote ${quote.id} is missing text, author, or reflection.`);
  }

  if (quote.text.includes('?') || quote.text.startsWith('*')) {
    failures += 1;
    console.error(`Quote ${quote.id} is not suitable as a direct morning quote.`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`Validated ${quoteBank.length} quotes.`);
}
