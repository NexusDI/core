import { expect } from 'vitest';

import { lineOf, type NexusError } from '../src/errors/index.js';

/**
 * Core's one-line message for an error other than a BlueprintError: the
 * code, then the line its own enumerable fields give.
 */
export function coreLine(error: NexusError): string {
  return `[${error.code}] ${lineOf(error.code, { ...error })}`;
}

/**
 * Asserts that `error` carries core's one-line message. The same scenario
 * with errors() registered, and revision 1's text, runs in
 * libs/errors/src/parity/operations.test.ts.
 */
export function expectCoreLine(error: NexusError): void {
  expect(error.message).toBe(coreLine(error));
}
