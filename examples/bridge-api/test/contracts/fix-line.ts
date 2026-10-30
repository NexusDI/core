import {
  type ErrorText,
  type ErrorTextKit,
  type ErrorTextPack,
  isNexusError,
  type NexusError,
  type NexusErrorByCode,
} from '@nexusdi/core';
import { coreText } from '@nexusdi/core/text';
import { explain } from '@nexusdi/errors';
import { expect } from 'vitest';

type Entry = (
  error: NexusError,
  view: undefined,
  kit: ErrorTextKit,
) => ErrorText | undefined;

const NO_NEAR_MISSES: ErrorTextKit = { nearMisses: () => [] };

/** The first error of `code` in `error`, in its `errors` and its `cause` chain. */
export function findCode<C extends keyof NexusErrorByCode>(
  error: unknown,
  code: C,
): NexusErrorByCode[C] {
  const seen = new Set<unknown>();
  const visit = (value: unknown): NexusErrorByCode[C] | undefined => {
    if (typeof value !== 'object' || value === null || seen.has(value))
      return undefined;
    seen.add(value);
    if (isNexusError(value, code)) return value;
    const { errors, cause } = value as { errors?: unknown; cause?: unknown };
    for (const next of [...(Array.isArray(errors) ? errors : []), cause]) {
      const found = visit(next);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const found = visit(error);
  if (found === undefined) throw new Error(`Expected ${code} in the error.`);
  return found;
}

/** The fix line of `text`: its `fix`, else the `Fix:` line its message holds. */
function fixLineOf(text: ErrorText | undefined): string | undefined {
  return text?.fix ?? /^ *Fix: (.+)$/m.exec(text?.message ?? '')?.[1];
}

/** The text core's export holds for `error`. */
function exportText(
  error: NexusError,
  owner: ErrorTextPack,
): ErrorText | undefined {
  const entry = (owner as unknown as Record<string, Entry | undefined>)[
    error.code
  ];
  return entry?.(error, undefined, NO_NEAR_MISSES);
}

/**
 * Asserts that `explain()` words `error` with the fix line core's text export
 * holds for its code, and that the line exists. The expected line is read from
 * the export, so a change to the wording moves both sides together, and an
 * error core stops wording fails here.
 */
export function expectFixLine(
  error: NexusError,
  owner: ErrorTextPack = coreText,
): string {
  const fix = fixLineOf(exportText(error, owner));
  expect(fix, `${error.code} has a fix line`).toBeTypeOf('string');
  expect(fixLineOf(explain(error, { text: [owner] }))).toBe(fix);
  return fix as string;
}

/**
 * For a code whose text carries no fix line today, because the cause or the
 * issue list says what to change: asserts that `explain()` words `error` as
 * the export does and that neither holds a fix line.
 */
export function expectTextWithoutFixLine(
  error: NexusError,
  owner: ErrorTextPack = coreText,
): void {
  const text = exportText(error, owner);
  expect(text, `${error.code} has text`).toBeDefined();
  expect(fixLineOf(text)).toBeUndefined();
  expect(explain(error, { text: [owner] })?.message).toBe(text?.message);
}

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
