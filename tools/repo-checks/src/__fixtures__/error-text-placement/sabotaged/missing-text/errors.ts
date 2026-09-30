import { errorBase } from '@acme/nexusdi-core';

export class CacheMissError extends errorBase<
  'ACME_CACHE_MISS',
  { readonly key: string }
>('ACME_CACHE_MISS', 'CacheMissError') {}

export class CacheStaleError extends errorBase<
  'ACME_CACHE_STALE',
  { readonly key: string }
>('ACME_CACHE_STALE', 'CacheStaleError') {}

// A raise site without text covers nothing.
export const cacheStale = (key: string): CacheStaleError =>
  new CacheStaleError({ key });

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_CACHE_MISS: CacheMissError;
    ACME_CACHE_STALE: CacheStaleError;
  }
}
