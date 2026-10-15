import { describe, expect, it } from 'vitest';

import {
  assemble,
  checkGraph,
  describeGraph,
  hash,
  PROVIDER_KINDS,
} from './graph.ts';
import { six, sixWithAlias } from './six.ts';

describe('assemble', () => {
  it('roots the modules nobody imports and targets the widest entry', () => {
    const g = six();
    expect(g.rootImports).toEqual([1]);
    expect(g.entries).toEqual([4, 5]);
    expect(g.target).toBe(4);
  });
});

describe('assemble with a target outside the entries', () => {
  it('targets the provider with the largest closure in the whole graph, lowest index on a tie', () => {
    const g = six();
    // p4 (closure 5) is an entry; p2 and p3 are not, and have smaller closures.
    expect(g.target).toBe(4);
    // Make p2 reach more than any entry: it becomes the target though m1 does not export it.
    g.providers[2].deps = [0, 1];
    g.providers[1].deps = [0];
    g.providers[4].deps = [3];
    g.providers[3].deps = [];
    const again = assemble('mixed', 6, 1, g.providers, g.modules);
    expect(again.entries).toEqual([4, 5]);
    expect(again.target).toBe(2);
  });
});

describe('the alias kind', () => {
  it('is a kind scale.json counts', () => {
    expect(PROVIDER_KINDS).toContain('alias');
    expect(describeGraph(sixWithAlias()).kinds).toEqual({
      class: 4,
      factory: 1,
      'async-factory': 0,
      value: 1,
      alias: 1,
    });
  });
  it('is accepted when it has one visible dependency', () => {
    expect(() => checkGraph(sixWithAlias())).not.toThrow();
  });
  it('rejects an alias with no dependency or two', () => {
    const none = sixWithAlias();
    none.providers[6].deps = [];
    expect(() => checkGraph(none)).toThrow(/p6 is an alias with 0 deps/);
    const two = sixWithAlias();
    two.providers[6].deps = [3, 5];
    expect(() => checkGraph(two)).toThrow(/p6 is an alias with 2 deps/);
  });
  it('rejects an alias of a provider its module cannot see', () => {
    const g = sixWithAlias();
    g.providers[6].deps = [0];
    expect(() => checkGraph(g)).toThrow(/p6 .*cannot see p0/);
  });
  it('counts the alias hop in maxDepth', () => {
    const g = sixWithAlias();
    // p6 -> p5 -> p3 -> p1 -> p0: four edges, one more than p5's three.
    expect(describeGraph(g).maxDepth).toBe(4);
  });
});

describe('checkGraph', () => {
  it('accepts a well-formed graph', () => {
    expect(() => checkGraph(six())).not.toThrow();
  });
  it('rejects a forward edge', () => {
    const g = six();
    g.providers[1].deps = [2];
    expect(() => checkGraph(g)).toThrow(/p1 depends on p2.*not lower/);
  });
  it('rejects a missing index', () => {
    const g = six();
    g.providers.splice(3, 1);
    expect(() => checkGraph(g)).toThrow(/5 providers, expected 6/);
    g.size = 5;
    expect(() => checkGraph(g)).toThrow(/index 3 holds provider 4/);
  });
  it('rejects a dependency its module cannot see', () => {
    const g = six();
    // p0 sits in m0 but m0 does not export it.
    g.providers[5].deps = [0];
    expect(() => checkGraph(g)).toThrow(/p5 .*cannot see p0/);
  });
  it('rejects a dependency listed twice', () => {
    const g = six();
    g.providers[4].deps = [3, 3];
    expect(() => checkGraph(g)).toThrow(/twice/);
  });
});

describe('describeGraph', () => {
  it('gives the counts, depth, fan-in and hash of the six-provider graph', () => {
    expect(describeGraph(six())).toEqual({
      shape: 'mixed',
      size: 6,
      hash: hash(six()),
      providers: 6,
      edges: 7,
      modules: 2,
      maxDepth: 3,
      meanFanOut: 1.17,
      maxFanOut: 2,
      maxFanIn: 2,
      kinds: { class: 4, factory: 1, 'async-factory': 0, value: 1, alias: 0 },
      target: 4,
      targetClosure: 5,
    });
    expect(hash(six())).toBe('6db83ad061b9');
  });
});

describe('hash', () => {
  it('is 12 hex digits and stable across calls', () => {
    expect(hash(six())).toMatch(/^[0-9a-f]{12}$/);
    expect(hash(six())).toBe(hash(six()));
  });
  it('changes when one edge changes', () => {
    const g = six();
    g.providers[5].deps = [4];
    expect(hash(g)).not.toBe(hash(six()));
  });
  it('ignores the shape, seed and derived fields', () => {
    const g = six();
    g.shape = 'wide';
    g.seed = 2;
    g.target = 5;
    expect(hash(g)).toBe(hash(six()));
  });
});
