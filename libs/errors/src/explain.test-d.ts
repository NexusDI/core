import { describe, expectTypeOf, it } from 'vitest';

import type {
  BlueprintView,
  ErrorText,
  ErrorTextPack,
  NexusError,
} from '@nexusdi/core';

import { explain, type ExplainOptions } from './index.js';

describe('explain', () => {
  it('takes the view and the packs in one options object', () => {
    expectTypeOf<ExplainOptions>().toEqualTypeOf<{
      readonly view?: BlueprintView;
      readonly text?: readonly ErrorTextPack[];
    }>();
    expectTypeOf(explain).parameters.toEqualTypeOf<
      [error: NexusError, options?: ExplainOptions]
    >();
    expectTypeOf(explain).returns.toEqualTypeOf<ErrorText | undefined>();
  });

  it('rejects a bare view as its second argument', () => {
    const error = {} as NexusError;
    const view = {} as BlueprintView;
    // @ts-expect-error a view goes in the options object
    explain(error, view);
  });
});
