import { errorBase } from '@acme/nexusdi-core';

export class CacheMissError extends errorBase<
  'NEXUS_CACHE_MISS',
  { readonly key: string }
>('NEXUS_CACHE_MISS', 'CacheMissError') {}

/** A package may compare the codes it declares. */
export const isCacheMiss = (error: { readonly code: string }): boolean =>
  error.code === 'NEXUS_CACHE_MISS';

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_CACHE_MISS: CacheMissError;
  }
}
