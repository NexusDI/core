import { runInNewContext } from 'node:vm';

import {
  defineModule,
  provide,
  Token,
  type ModuleDefinition,
} from '../src/index.js';

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
  const [head] = tokens;
  if (head === undefined) throw new Error('moduleChain needs depth >= 1');
  let next: ModuleDefinition | undefined;
  for (const [i, token] of [...tokens.entries()].reverse()) {
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
  if (next === undefined) throw new Error('moduleChain needs depth >= 1');
  return { root: next, head };
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
      const d = Object.getOwnPropertyDescriptor(target, key);
      return [
        String(key),
        d === undefined ? undefined : (d.get ?? d.set ?? d.value),
      ];
    });
  return {
    object: read(Object.prototype),
    function: read(Function.prototype),
    array: read(Array.prototype),
    symbol: read(Symbol),
    globals: Reflect.ownKeys(globalThis).map((key) => [String(key), undefined]),
  };
}
