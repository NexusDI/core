import {
  ERROR_BRAND,
  isDisposed,
  isNexusError,
  NEXUS_PLUGIN_API,
} from '@acme/core';

/** Reads the owner's vocabulary through what the owner exports. */
export function statusOf(error: unknown): number {
  if (!isNexusError(error)) return 0;
  return isDisposed(error) ? 503 : 500;
}

export const branded = (value: object): boolean => ERROR_BRAND in value;

/** A NEXUS_ name that is no code. */
export const pluginApi: number = NEXUS_PLUGIN_API;

/** A prefix test on a value that is no code. */
export const isScratch = (name: string): boolean => name.startsWith('tmp-');

/** A pattern that finds codes in prose tests no code prefix. */
export const mentions = (text: string): string[] =>
  text.match(/\bNEXUS_[A-Z_]+\b/g) ?? [];
