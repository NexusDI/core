import { ERROR_BRAND, isDisposed, isNexusError } from '@acme/core';

/** Reads the owner's vocabulary through what the owner exports. */
export function statusOf(error: unknown): number {
  if (!isNexusError(error)) return 0;
  return isDisposed(error) ? 503 : 500;
}

export const branded = (value: object): boolean => ERROR_BRAND in value;

/** A prefix test on a value that is no code. */
export const isScratch = (name: string): boolean => name.startsWith('tmp-');
