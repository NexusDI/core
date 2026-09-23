import { runInNewContext } from 'node:vm';

import { expect } from 'vitest';

import {
  defineModule,
  provide,
  Token,
  type ModuleDefinition,
  type NexusGraph,
} from '../src/index.js';

/** A graph survives a JSON round trip, holds no cycle, and every object in it is plain. */
export function expectPlainGraph(graph: NexusGraph): void {
  expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
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
  visit(graph);
}

/**
 * `depth` modules, each importing and re-exporting the next, each providing a
 * number one higher than the next module's. The head resolves to `depth`.
 */
export function moduleChain(depth: number): {
  root: ModuleDefinition;
  head: Token<number>;
} {
  const tokens = Array.from(
    { length: depth },
    (_, i) => new Token<number>(`Level${i}`),
  );
  let next: ModuleDefinition | undefined;
  for (let i = depth - 1; i >= 0; i--) {
    const token = tokens[i]!;
    const below = tokens[i + 1];
    next = defineModule({
      name: `Deck${i}`,
      imports: next === undefined ? [] : [next],
      providers: [
        below === undefined
          ? provide(token, { useValue: 1 })
          : provide(token, { useFactory: (n: number) => n + 1, deps: [below] }),
      ],
      exports: next === undefined ? [token] : [token, next],
    });
  }
  return { root: next!, head: tokens[0]! };
}

/** Keys the expression's object has here that a fresh realm's copy lacks. */
export function extraKeys(expression: string): string[] {
  const pristine = new Set(
    runInNewContext(`Reflect.ownKeys(${expression}).map(String)`) as string[],
  );
  const current = new Function(
    `return Reflect.ownKeys(${expression}).map(String)`,
  )() as string[];
  return current.filter((key) => !pristine.has(key));
}

/** Every own key and its value or accessors, for the built-ins a container could write to. */
export function snapshotBuiltins(): Record<string, [string, unknown][]> {
  const read = (target: object): [string, unknown][] =>
    Reflect.ownKeys(target).map((key) => {
      const d = Object.getOwnPropertyDescriptor(target, key)!;
      return [String(key), d.get ?? d.set ?? d.value];
    });
  return {
    object: read(Object.prototype),
    function: read(Function.prototype),
    array: read(Array.prototype),
    symbol: read(Symbol),
    globals: Reflect.ownKeys(globalThis).map((key) => [String(key), undefined]),
  };
}
