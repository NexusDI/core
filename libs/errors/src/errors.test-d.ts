import { describe, expectTypeOf, it } from 'vitest';

import type { ErrorTextPack, NexusPlugin } from '@nexusdi/core';

import { errors, type ErrorsOptions } from './index.js';

describe('errors', () => {
  it('takes the packs as text', () => {
    expectTypeOf<ErrorsOptions>().toEqualTypeOf<{
      readonly text?: readonly ErrorTextPack[];
    }>();
    expectTypeOf(errors).parameters.toEqualTypeOf<[options?: ErrorsOptions]>();
    expectTypeOf(errors).returns.toEqualTypeOf<NexusPlugin>();
  });
});
