import type { ErrorTextPack } from '@acme/nexusdi-core';

export const cacheText = {
  ACME_CACHE_MISS: (error) => ({ message: `${error.key} is not cached.` }),
} satisfies ErrorTextPack;
