import { describe, expect, it } from 'vitest';

import * as core from '../src/index.js';
import { makeGraph } from './graph.mjs';

describe('makeGraph', () => {
  it.each([50, 2000] as const)(
    'builds a valid %i-provider graph',
    async (size) => {
      const { providers, lookups } = makeGraph(core, size);
      expect(providers).toHaveLength(size);
      const ship = await core.Nexus.create(providers as never);
      for (const token of lookups) ship.get(token as never);
      const scope = await ship.createScope();
      await scope[Symbol.asyncDispose]();
      await ship[Symbol.asyncDispose]();
    },
  );
  it('leaves scoped classes out of the lookups', () => {
    const { lookups } = makeGraph(core, 50);
    expect(lookups).toHaveLength(45);
  });
});
