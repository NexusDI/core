import type { ComponentProps } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import type { ConsoleFrame, Marker, Notice } from './index.js';

describe('component props', () => {
  it('takes the console title as a formatted string', () => {
    expectTypeOf<
      ComponentProps<typeof ConsoleFrame>['title']
    >().toEqualTypeOf<string>();
  });

  it('limits the notice kinds to the four labels', () => {
    expectTypeOf<ComponentProps<typeof Notice>['kind']>().toEqualTypeOf<
      'note' | 'exception' | 'warning' | 'ship'
    >();
  });

  it('limits the marker lifetimes to the graph lifetimes', () => {
    expectTypeOf<ComponentProps<typeof Marker>['lifetime']>().toEqualTypeOf<
      'singleton' | 'scoped' | 'transient' | 'none' | undefined
    >();
  });
});
