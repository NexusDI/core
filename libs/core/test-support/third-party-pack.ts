import type { ErrorTextPack } from '../src/index.js';
import './third-party-codes.js';

// A third-party package's text pack, written the way spec §2.5.2's
// @acme/cache/text writes one: keys are codes from NexusErrorByCode, and the
// entry reads a hidden `lookup` and asks the kit for near misses.
export const cacheText = {
  ACME_CACHE_STORE: (error, _view, kit) => {
    const lookup = (error as { lookup?: { token: unknown; moduleId: string } })
      .lookup;
    return {
      message: `${error.module} asked for the ${error.store} store, which no module provides.`,
      fix: 'provide it: provide(CACHE_STORE, { useClass: RedisStore }).',
      nearMisses:
        lookup === undefined
          ? []
          : kit.nearMisses(lookup.token, lookup.moduleId),
    };
  },
} satisfies ErrorTextPack;
