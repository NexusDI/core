import {
  defineModule,
  provide,
  Token,
  type ModuleDefinition,
} from '@nexusdi/core';

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
