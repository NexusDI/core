import { expect } from 'vitest';

import { lineOf, type NexusError } from '../src/errors/index.js';
import type { NexusPlugin } from '../src/index.js';
import { render } from '../src/text/index.js';
import { textPlugin } from './text-plugin.js';

export interface ErrorMode {
  readonly name: 'core' | 'text';
  readonly plugins: readonly NexusPlugin[];
}

/** Every message test runs once per mode. */
export const errorModes: readonly ErrorMode[] = [
  { name: 'core', plugins: [] },
  { name: 'text', plugins: [textPlugin()] },
];

/**
 * Core's one-line message for an error other than a BlueprintError: the
 * code, then the line its own enumerable fields give.
 */
export function coreLine(error: NexusError): string {
  return `[${error.code}] ${lineOf(error.code, { ...error })}`;
}

/**
 * Asserts the message of an error a container raised with `mode.plugins`:
 * revision 1's text in text mode, core's line in core mode.
 */
export function expectMessage(
  mode: ErrorMode,
  error: NexusError,
  revision1: string,
): void {
  expect(error.message).toBe(
    mode.name === 'text' ? revision1 : coreLine(error),
  );
}

/**
 * Asserts an error raised where no container exists, such as a direct
 * compile() or normalizeProvider() call: text mode renders revision 1's
 * text from the fields, and core mode keeps core's line.
 */
export function expectRendered(
  mode: ErrorMode,
  error: NexusError,
  revision1: string,
): void {
  if (mode.name === 'text') expect(render(error)).toBe(revision1);
  else expect(error.message).toBe(coreLine(error));
}
