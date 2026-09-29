/**
 * Tier 1: hostile inputs the package prevents. One describe per entry of
 * libs/devtools/SECURITY.md, titled with its identifier.
 */
import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

import { moduleChain } from '../../test-support/security.js';
import { devtools, graph, type NexusGraph } from '../index.js';

/** A graph survives a JSON round trip, holds no cycle, and every object in it is plain. */
function expectPlainGraph(view: NexusGraph): void {
  expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  const visit = (value: unknown): void => {
    expect(['function', 'symbol', 'undefined', 'bigint']).not.toContain(
      typeof value,
    );
    if (typeof value !== 'object' || value === null) return;
    expect([Object.prototype, Array.prototype]).toContain(
      Object.getPrototypeOf(value),
    );
    for (const child of Object.values(value)) visit(child);
  };
  visit(view);
}

describe('SEC-010 graph() stays plain JSON (CWE-20)', () => {
  it('returns plain JSON for prototype names, proxies, null chains, repeats and deep chains', async () => {
    class Engine {}
    class Void extends null {
      constructor() {
        return Object.create(Void.prototype) as Void;
      }
    }
    const PROTO = new Token<string>('__proto__');
    const Proto = defineModule({
      name: 'constructor',
      providers: [provide(PROTO, { useValue: 'x' })],
      exports: [PROTO],
    });
    const { root: Deep } = moduleChain(50);
    const Root = defineModule({
      name: 'prototype',
      imports: [Proto, Proto, Deep],
      providers: [new Proxy(Engine, {}), Void, Void],
    });
    await using ship = await Nexus.create(Root, { plugins: [devtools()] });
    expectPlainGraph(graph(ship));
  });
});
