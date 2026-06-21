import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('creates a pino logger at the configured level', () => {
    const logger = createLogger({ logLevel: 'warn' });

    expect(logger.level).toBe('warn');
    expect(typeof logger.info).toBe('function');
  });
});
