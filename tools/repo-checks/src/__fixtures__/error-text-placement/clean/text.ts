import type { ErrorTextPack } from '@acme/nexusdi-core';

export const cacheText = {
  ACME_CACHE_MISS: (error) => ({ message: `${error.key} is not cached.` }),
  ACME_STORE_FULL: (error) => ({ message: `${error.store} is full.` }),
  ACME_STORE_LOCKED: (error) => ({ message: `${error.store} is locked.` }),
} satisfies ErrorTextPack;
