import { errorBase } from '@acme/nexusdi-core';

export class CacheMissError extends errorBase<
  'ACME_CACHE_MISS',
  { readonly key: string }
>('ACME_CACHE_MISS', 'CacheMissError') {}

export function cacheMiss(key: string): CacheMissError {
  return new CacheMissError({ key });
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_CACHE_MISS: CacheMissError;
  }
}
