import { describe, expectTypeOf, it } from 'vitest';

import type { Nexus, NexusRequest, Resolve } from '../index.js';
import { REQUEST } from './request.js';
import type { Token } from './token.js';

describe('REQUEST', () => {
  it('is a Token of the augmented NexusRequest', () => {
    expectTypeOf(REQUEST).toEqualTypeOf<Token<NexusRequest>>();
    // test-support/nexus-request.ts augments NexusRequest through the package entry.
    expectTypeOf<NexusRequest['mission']>().toEqualTypeOf<string | undefined>();
  });
});

describe('NexusRequest (G12)', () => {
  it('merges an augmented field the way an adapter reads it', () => {
    // An adapter or application augments the interface through the package entry.
    // Core's own tests keep the test-support field optional, so {} satisfies it.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- G12 states `{} extends NexusRequest`
    expectTypeOf<{}>().toExtend<NexusRequest>();
    expectTypeOf<Parameters<Nexus['createScope']>[0]>().toEqualTypeOf<
      { readonly request?: NexusRequest } | undefined
    >();
    expectTypeOf<Resolve<typeof REQUEST>>().toEqualTypeOf<NexusRequest>();
    expectTypeOf<NexusRequest['mission']>().toEqualTypeOf<string | undefined>();
  });
});
