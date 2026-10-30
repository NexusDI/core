import type { NexusError } from '@nexusdi/core';
import { expect } from 'vitest';

/**
 * For a code the throwing package words in the error's own message, such as
 * the testing package's overrides: asserts that the message holds a fix line.
 * No pack words these codes, so explain() has nothing to add.
 */
export function expectOwnFixLine(error: NexusError): string {
  const fix = /^ *Fix: (.+)$/m.exec(error.message)?.[1];
  expect(fix, `${error.code} carries a fix line`).toBeTypeOf('string');
  return fix as string;
}
