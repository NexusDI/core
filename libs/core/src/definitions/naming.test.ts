import { describe, expect, it } from 'vitest';

import {
  describeValue,
  displayName,
  isForeign,
  provide,
  Token,
} from '../index.js';

/**
 * displayName, describeValue and isForeign, imported the way a plugin
 * imports them: from the package's main entry. token.test.ts and
 * describe.test.ts cover the internals directly; this file covers the
 * documented contract each function's doc comment promises.
 */

interface ILogger {
  log(message: string): void;
}

describe('displayName', () => {
  it('reads a token description', () => {
    const LOGGER = new Token<ILogger>('Logger');
    expect(displayName(LOGGER)).toBe('Logger');
  });
});

describe('describeValue', () => {
  it('quotes a string', () => {
    expect(describeValue('x')).toBe('the string "x"');
  });
});

describe('isForeign', () => {
  it('reads true for a value branded by a fake second copy', () => {
    const fake = Object.defineProperty({}, Symbol.for('nexusdi.definition'), {
      value: true,
    });
    expect(isForeign(fake)).toBe(true);
  });

  it('reads false for a provide() result this copy made', () => {
    const LOGGER = new Token<ILogger>('Logger');
    const entry = provide(LOGGER, { useValue: { log: () => undefined } });
    expect(isForeign(entry)).toBe(false);
  });
});
