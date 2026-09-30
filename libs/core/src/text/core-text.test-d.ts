import { describe, expectTypeOf, it } from 'vitest';

import type { ErrorTextPack, NexusErrorByCode } from '../index.js';
import { coreText } from '../text/index.js';

// Core's spec program also sees test-support's ACME_CACHE_STORE, so the
// codes core owns are the NEXUS_ keys.
type CoreCode = Extract<keyof NexusErrorByCode, `NEXUS_${string}`>;

describe('coreText', () => {
  it('has an entry for every core code but the aggregate the engine renders', () => {
    expectTypeOf<
      Exclude<CoreCode, keyof typeof coreText>
    >().toEqualTypeOf<'NEXUS_BLUEPRINT_INVALID'>();
  });

  it('is a text pack', () => {
    expectTypeOf(coreText).toExtend<ErrorTextPack>();
  });
});
