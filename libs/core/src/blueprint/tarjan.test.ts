import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { compile } from './compile.js';
import { cyclePath, findCycles } from './tarjan.js';

const graph = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries));
const rank = (id: string) => Number(id.slice(1));

describe('findCycles', () => {
  it('finds each strongly connected component with a cycle', () => {
    const successors = graph({
      p0: ['p1'],
      p1: ['p2'],
      p2: ['p0'],
      p3: ['p3'],
      p4: ['p0'],
    });
    const cycles = findCycles(['p0', 'p1', 'p2', 'p3', 'p4'], successors).map(
      (c) => [...c].sort(),
    );
    expect(cycles).toEqual([['p0', 'p1', 'p2'], ['p3']]);
  });

  it('handles a chain of 20000 nodes without overflowing the stack', () => {
    const ids = Array.from({ length: 20_000 }, (_, i) => `p${i}`);
    const successors = new Map(
      ids.map((id, i) => [id, i + 1 < ids.length ? [`p${i + 1}`] : []]),
    );
    expect(findCycles(ids, successors)).toEqual([]);
  });
});

describe('cyclePath', () => {
  it('walks the cycle from its lowest-ranked node back to itself', () => {
    const successors = graph({ p2: ['p0'], p0: ['p1'], p1: ['p2'] });
    expect(cyclePath(['p2', 'p1', 'p0'], successors, rank)).toEqual([
      'p0',
      'p1',
      'p2',
      'p0',
    ]);
  });

  it('reports a self-edge as a two-step path', () => {
    expect(cyclePath(['p3'], graph({ p3: ['p3'] }), rank)).toEqual([
      'p3',
      'p3',
    ]);
  });
});

describe('compile', () => {
  class ShieldGrid {
    constructor(readonly router: any) {}
  }
  class PowerRouter {
    constructor(readonly shields: any) {}
  }

  it('reports NEXUS_CIRCULAR_DEPENDENCY for a cycle without a lazy edge', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(PowerRouter, { deps: [ShieldGrid] }),
        provide(ShieldGrid, { deps: [PowerRouter] }),
      ],
    });
    expect(compileErrors(Engineering)).toMatchObject([
      {
        code: 'NEXUS_CIRCULAR_DEPENDENCY',
        path: ['PowerRouter', 'ShieldGrid', 'PowerRouter'],
      },
    ]);
  });

  it('accepts a cycle that one lazy edge breaks', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
        provide(ShieldGrid, { deps: [PowerRouter] }),
      ],
    });
    expect(() => compile({ root: Engineering })).not.toThrow();
  });

  it('reports two aliases that point at each other as a cycle', () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(A, { useExisting: B }),
        provide(B, { useExisting: A }),
      ],
    });
    expect(compileErrors(Root)).toMatchObject([
      { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['A', 'B', 'A'] },
    ]);
  });

  it('reports a provider that depends on its own token', () => {
    const NAME = new Token<string>('Name');
    const Root = defineModule({
      name: 'Root',
      providers: [provide(NAME, { useFactory: (n) => n, deps: [NAME] })],
    });
    expect(compileErrors(Root)).toMatchObject([
      { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['Name', 'Name'] },
    ]);
  });

  describe('rings of any length', () => {
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((n) => new Token<string>(n));
    const node = (token: Token<string>, ...deps: unknown[]) =>
      provide(token, {
        useFactory: (...args: unknown[]) => String(args),
        deps,
      } as never);

    it('reports a three-provider ring with the whole path', () => {
      const Root = defineModule({
        name: 'Root',
        providers: [node(A, B), node(B, C), node(C, A)],
      });
      expect(compileErrors(Root)).toMatchObject([
        { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['A', 'B', 'C', 'A'] },
      ]);
    });

    it('reports a ring that crosses module boundaries', () => {
      const Drive = defineModule({
        name: 'Drive',
        providers: [node(C, A)],
        exports: [C],
      });
      const Helm = defineModule({
        name: 'Helm',
        imports: [Drive],
        providers: [node(B, C)],
        exports: [B],
      });
      const Hull = defineModule({
        name: 'Hull',
        global: true,
        imports: [Helm],
        providers: [node(A, B)],
        exports: [A],
      });
      const Root = defineModule({ name: 'Root', imports: [Hull] });
      expect(compileErrors(Root)).toMatchObject([
        { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['A', 'B', 'C', 'A'] },
      ]);
    });

    it('accepts a three-provider ring when any one edge is lazy', () => {
      for (const lazyAt of [0, 1, 2]) {
        const edge = (i: number, to: Token<string>) =>
          i === lazyAt ? lazy(to) : to;
        const Root = defineModule({
          name: 'Root',
          providers: [
            node(A, edge(0, B)),
            node(B, edge(1, C)),
            node(C, edge(2, A)),
          ],
        });
        expect(() => compile({ root: Root })).not.toThrow();
      }
    });

    it('reports overlapping rings as one error per component', () => {
      // A -> B -> A and A -> C -> D -> A share A.
      const Root = defineModule({
        name: 'Root',
        providers: [node(A, B, C), node(B, A), node(C, D), node(D, A)],
      });
      expect(compileErrors(Root)).toMatchObject([
        { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['A', 'B', 'A'] },
      ]);
    });

    it('keeps reporting a component while one overlapping ring has no lazy edge', () => {
      const withLazy = (edgeFromA: 'B' | 'C') =>
        defineModule({
          name: 'Root',
          providers: [
            node(
              A,
              edgeFromA === 'B' ? lazy(B) : B,
              edgeFromA === 'C' ? lazy(C) : C,
            ),
            node(B, A),
            node(C, D),
            node(D, A),
          ],
        });
      // Lazy A -> B leaves A -> C -> D -> A.
      expect(compileErrors(withLazy('B'))).toMatchObject([
        { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['A', 'C', 'D', 'A'] },
      ]);
      // Lazy A -> C leaves A -> B -> A.
      expect(compileErrors(withLazy('C'))).toMatchObject([
        { code: 'NEXUS_CIRCULAR_DEPENDENCY', path: ['A', 'B', 'A'] },
      ]);
    });

    it('breaks both overlapping rings with one lazy edge on the shared part', () => {
      // A -> E -> F -> A and A -> E -> G -> A share the edge A -> E.
      const [E, F, G] = ['E', 'F', 'G'].map((n) => new Token<string>(n));
      const Root = defineModule({
        name: 'Root',
        providers: [node(A, E), node(E, F, G), node(F, A), node(G, A)],
      });
      expect(compileErrors(Root)).toHaveLength(1);
      const Fixed = defineModule({
        name: 'Root',
        providers: [node(A, lazy(E)), node(E, F, G), node(F, A), node(G, A)],
      });
      expect(() => compile({ root: Fixed })).not.toThrow();
    });
  });
});
