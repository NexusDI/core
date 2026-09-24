import { describe, expect, it } from 'vitest';

import { deferred } from '../../test-support/deferred.js';
import { defineModule, Nexus } from '../index.js';
import * as node from './index.js';
import { nodeScopeContext } from './index.js';

describe('nodeScopeContext', () => {
  it('keeps the scope across awaits inside runInScope', async () => {
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      scopeContext: nodeScopeContext(),
    });
    await using shuttle = await ship.createScope();
    const seen = await ship.runInScope(shuttle, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return ship.currentScope();
    });
    expect(seen).toBe(shuttle);
    expect(ship.currentScope()).toBeUndefined();
  });

  it('keeps two concurrent requests apart', async () => {
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      scopeContext: nodeScopeContext(),
    });
    await using first = await ship.createScope();
    await using second = await ship.createScope();
    const firstGate = deferred();
    const secondGate = deferred();
    const a = ship.runInScope(first, async () => {
      await firstGate.promise;
      return ship.currentScope();
    });
    const b = ship.runInScope(second, async () => {
      await secondGate.promise;
      return ship.currentScope();
    });
    secondGate.resolve();
    firstGate.resolve();
    expect(await a).toBe(first);
    expect(await b).toBe(second);
  });

  it('gives each context its own storage', async () => {
    const one = nodeScopeContext();
    const two = nodeScopeContext();
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      scopeContext: one,
    });
    await using shuttle = await ship.createScope();
    one.run(shuttle, () => {
      expect(one.current()).toBe(shuttle);
      expect(two.current()).toBeUndefined();
    });
  });

  it('is the only export of @nexusdi/core/node', () => {
    expect(Object.keys(node)).toEqual(['nodeScopeContext']);
  });
});
