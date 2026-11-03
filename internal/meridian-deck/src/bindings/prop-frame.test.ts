import type { PropState } from '@nexusdi/meridian-systems/geometry';
import { describe, expectTypeOf, it } from 'vitest';

import type { PropFrame } from '../state/index.js';

describe('PropFrame', () => {
  it('lists the members of the geometry PropState', () => {
    expectTypeOf<PropFrame>().toEqualTypeOf<PropState>();
  });
});
