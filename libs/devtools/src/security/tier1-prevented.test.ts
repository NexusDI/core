/**
 * Tier 1 entries of libs/core/SECURITY.md whose subject moved into
 * @nexusdi/devtools with graph().
 */
import { describe, expect, it } from 'vitest';

import {
  Nexus,
  Token,
  defineModule,
  provide,
  type ModuleDefinition,
} from '@nexusdi/core';

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

/** `depth` modules, each importing and re-exporting the next. */
function importChain(depth: number): ModuleDefinition {
  let next = defineModule({ name: `Deck${depth - 1}` });
  for (let i = depth - 2; i >= 0; i--)
    next = defineModule({ name: `Deck${i}`, imports: [next], exports: [next] });
  return next;
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
    const Root = defineModule({
      name: 'prototype',
      imports: [Proto, Proto, importChain(50)],
      providers: [new Proxy(Engine, {}), Void, Void],
    });
    await using ship = await Nexus.create(Root, { plugins: [devtools()] });
    expectPlainGraph(graph(ship));
  });
});
