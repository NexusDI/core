import { describe, expectTypeOf, it } from 'vitest';

import type { CreateOptions, Nexus } from '../index.js';

describe('Nexus', () => {
  it('has no graph(); graph(ship) lives in @nexusdi/devtools', () => {
    expectTypeOf<Nexus>().not.toHaveProperty('graph');
  });
});

describe('CreateOptions', () => {
  it('has no trace option; trace(fn) is a plugin in @nexusdi/devtools', () => {
    expectTypeOf<CreateOptions>().not.toHaveProperty('trace');
    // @ts-expect-error the trace option left core
    const options: CreateOptions = { trace: () => {} };
    void options;
  });
});
