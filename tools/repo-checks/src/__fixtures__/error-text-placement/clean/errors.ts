import { errorBase } from '@acme/nexusdi-core';

/** A lookup found no entry. Its text lives in the pack. */
export class CacheMissError extends errorBase<
  'ACME_CACHE_MISS',
  { readonly key: string }
>('ACME_CACHE_MISS', 'CacheMissError') {}

interface StoreFields {
  readonly code: 'ACME_STORE_FULL' | 'ACME_STORE_LOCKED';
  readonly store: string;
}

/** One class for two codes; the code comes from the fields. */
export class StoreError extends errorBase<StoreFields['code'], StoreFields>(
  (fields) => fields.code,
  'StoreError',
) {}

/** Raised at decoration time, where no formatter runs, so its text is inline. */
export class CacheKeyError extends errorBase<
  'ACME_CACHE_KEY',
  { readonly key: string }
>('ACME_CACHE_KEY', 'CacheKeyError') {}

export function cacheMiss(key: string): CacheMissError {
  return new CacheMissError({ key });
}

export const storeFull = (store: string): StoreError =>
  new StoreError({ code: 'ACME_STORE_FULL', store });

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_CACHE_MISS: CacheMissError;
    ACME_STORE_FULL: StoreError;
    ACME_STORE_LOCKED: StoreError;
    ACME_CACHE_KEY: CacheKeyError;
  }
}
