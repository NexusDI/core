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
});
