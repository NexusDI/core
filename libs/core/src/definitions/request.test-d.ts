import { describe, expectTypeOf, it } from 'vitest';

import type { NexusRequest } from '../index.js';
import { REQUEST } from './request.js';
import type { Token } from './token.js';

describe('REQUEST', () => {
  it('is a Token of the augmented NexusRequest', () => {
    expectTypeOf(REQUEST).toEqualTypeOf<Token<NexusRequest>>();
    // test-support/nexus-request.ts augments NexusRequest through the package entry.
    expectTypeOf<NexusRequest['mission']>().toEqualTypeOf<string | undefined>();
  });
});
