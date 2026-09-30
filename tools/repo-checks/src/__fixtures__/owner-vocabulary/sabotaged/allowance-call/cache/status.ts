import { isNexusError } from '@acme/core';

export function statusOf(error: unknown): number {
  if (isNexusError(error, 'NEXUS_DISPOSED')) return 503;
  return 500;
}

export const disposed = (error: unknown): boolean =>
  isNexusError(error, 'NEXUS_DISPOSED');

export const swapped = (error: unknown): boolean =>
  isNexusError('NEXUS_DISPOSED', error);
