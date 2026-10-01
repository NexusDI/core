import { describe, expect, it } from 'vitest';

import { SchemaError, validate } from './schema.ts';

const versions = {
  core: '0.4.0',
  libraries: {
    nexusdi: '0.4.0',
    inversify: '8.2.3',
    tsyringe: '4.10.0',
    awilix: '13.0.5',
    'needle-di': '1.2.1',
  },
  toolchains: { tsc: '6.0.3' },
  node: '24.20.0',
};
const design = (measured: number) => ({
  order: 'williams',
  warmup: 100,
  measured,
  bootstrap: { resamples: 10000, block: 10, prng: 'mulberry32' },
});
const timings = (measured: number) => ({
  schema: 1,
  sha: 'abc1234',
  startedAt: '2026-10-01T04:00:00Z',
  versions,
  runner: {
    os: 'linux',
    cpu: 'AMD EPYC 7763',
    cores: 4,
    memoryGb: 16,
    hosted: true,
  },
  seed: 1,
  design: { 'cold-start': design(measured), 'in-process': design(measured) },
  results: [],
});

describe('validate', () => {
  it('accepts a published timings file', () => {
    expect(() => validate('timings', timings(1000), 'results')).not.toThrow();
  });
  it('rejects a quick run under results/', () => {
    expect(() => validate('timings', timings(50), 'results')).toThrow(
      /design\.in-process\.measured/,
    );
  });
  it('accepts a quick run under tmp/', () => {
    expect(() => validate('timings', timings(50), 'tmp')).not.toThrow();
  });
  it('rejects an unknown schema version', () => {
    expect(() =>
      validate('timings', { ...timings(1000), schema: 2 }, 'results'),
    ).toThrow(SchemaError);
  });
  it('rejects an outcome outside the enum', () => {
    const cell = {
      library: 'nexusdi',
      variant: 'plain',
      toolchain: 'tsc',
      profile: 'none',
      sections: { singleton: 'pass', transient: 'pass', scoped: 'ok' },
      outcome: 'pass',
      polyfill: null,
    };
    expect(() =>
      validate('matrix', { schema: 1, versions, cells: [cell] }, 'results'),
    ).toThrow(/cells\[0\]\.sections\.scoped/);
  });
});

const scaleFile = () => ({
  schema: 1,
  versions: { ...versions, bundlers: { esbuild: '0.28.2' }, tslib: '2.8.1' },
  graphSeed: 20261001,
  graphs: [
    {
      shape: 'mixed',
      size: 50,
      hash: '0123456789ab',
      providers: 50,
      edges: 94,
      modules: 5,
      maxDepth: 6,
      meanFanOut: 1.88,
      maxFanOut: 4,
      maxFanIn: 12,
      kinds: { class: 42, factory: 5, 'async-factory': 0, value: 3 },
      target: 49,
      targetClosure: 17,
    },
  ],
  cells: [
    {
      library: 'tsyringe',
      variant: 'decorated',
      shape: 'mixed-async',
      size: 50,
      outcome: 'not-applicable',
      message: 'tsyringe 4.10.0 declares no async resolution',
    },
  ],
  sizes: [
    {
      library: 'nexusdi',
      variant: 'plain',
      shape: 'mixed',
      size: 50,
      minified: 30000,
      gzip: 9000,
    },
  ],
  perProvider: [
    {
      library: 'nexusdi',
      variant: 'plain',
      shape: 'mixed',
      bytes: 'gzip',
      perProvider: 41.25,
    },
  ],
});

const stats = {
  median: 1,
  mad: 0,
  p5: 1,
  p95: 1,
  iterations: 1000,
  noisy: false,
};
const ratio = { median: 1.2, low: 1.1, high: 1.3, pairs: 1000 };
const SHAPES = ['mixed', 'wide', 'deep', 'modular', 'mixed-async'];
const scaleTimings = (rounds: Partial<Record<string, number>> = {}) => ({
  schema: 1,
  sha: 'abc1234',
  startedAt: '2026-10-01T04:00:00Z',
  versions,
  runner: {
    os: 'linux',
    cpu: 'Intel Xeon 8573C',
    cores: 4,
    memoryGb: 16,
    hosted: true,
  },
  seed: 1,
  graphSeed: 20261001,
  coreRef: {
    ref: 'workspace',
    tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  },
  graphs: [{ shape: 'mixed', size: 50, hash: '0123456789ab' }],
  design: {
    'fresh-process': Object.fromEntries(
      SHAPES.map((s) => [s, design(rounds[s] ?? (s === 'mixed' ? 1000 : 200))]),
    ),
    'steady-get': design(1000),
  },
  results: [
    {
      metric: 'startup',
      library: 'inversify',
      variant: 'decorated',
      shape: 'mixed',
      size: 50,
      toolchain: 'tsc',
      unit: 'ns',
      batch: 1,
      stats,
      vsNexus: ratio,
    },
    {
      metric: 'create',
      library: 'inversify',
      variant: 'decorated',
      shape: 'mixed',
      size: 50,
      toolchain: 'tsc',
      unit: 'ns',
      batch: 1,
      stats,
    },
  ],
  growth: [
    {
      metric: 'startup',
      library: 'nexusdi',
      variant: 'plain',
      shape: 'mixed',
      from: 1000,
      to: 5000,
      exponent: 1.02,
      low: 0.98,
      high: 1.06,
    },
  ],
  marginal: [
    {
      metric: 'heap-ready',
      library: 'nexusdi',
      variant: 'plain',
      shape: 'mixed',
      perProvider: 412,
    },
  ],
});

describe('validate scale', () => {
  it('accepts a valid scale file', () => {
    expect(() => validate('scale', scaleFile(), 'results')).not.toThrow();
  });
  it('rejects a cell with an unknown shape at its path', () => {
    const file = scaleFile();
    file.cells[0].shape = 'layered';
    expect(() => validate('scale', file, 'results')).toThrow(
      /scale\.cells\[0\]\.shape: expected mixed \| wide/,
    );
  });
  it('rejects a graph row with no hash at its path', () => {
    const file = scaleFile();
    delete (file.graphs[0] as { hash?: string }).hash;
    expect(() => validate('scale', file, 'results')).toThrow(
      /scale\.graphs\[0\]\.hash: expected a string/,
    );
  });
  it('rejects a bundle row outside mixed', () => {
    const file = scaleFile();
    (file.sizes[0] as { shape: string }).shape = 'wide';
    expect(() => validate('scale', file, 'results')).toThrow(
      /scale\.sizes\[0\]\.shape/,
    );
  });
});

describe('validate scale-timings', () => {
  it('accepts a valid published file', () => {
    expect(() =>
      validate('scale-timings', scaleTimings(), 'results'),
    ).not.toThrow();
  });
  it('rejects a file with no coreRef tree', () => {
    const file = scaleTimings() as { coreRef: { tree?: string } };
    delete file.coreRef.tree;
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.coreRef\.tree: expected a string/,
    );
  });
  it('rejects a timed graph with no hash', () => {
    const file = scaleTimings();
    delete (file.graphs[0] as { hash?: string }).hash;
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.graphs\[0\]\.hash/,
    );
  });
  it('rejects a growth entry with an unknown metric at its path', () => {
    const file = scaleTimings();
    file.growth[0].metric = 'create';
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.growth\[0\]\.metric: expected startup \| ready/,
    );
  });
  it('rejects a vsNexus on create at its path', () => {
    const file = scaleTimings();
    (file.results[1] as { vsNexus?: unknown }).vsNexus = ratio;
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.results\[1\]\.vsNexus/,
    );
  });
  it('rejects a row whose unit does not match its metric', () => {
    const file = scaleTimings();
    file.results[0].unit = 'bytes';
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.results\[0\]\.unit: expected "ns"/,
    );
  });
  it('holds fresh-process.mixed to 1,000 rounds under results/', () => {
    expect(() =>
      validate('scale-timings', scaleTimings({ mixed: 999 }), 'results'),
    ).toThrow(/scale-timings\.design\.fresh-process\.mixed\.measured/);
    expect(() =>
      validate('scale-timings', scaleTimings({ mixed: 1000 }), 'results'),
    ).not.toThrow();
  });
  it('holds fresh-process.wide to 200 rounds under results/', () => {
    expect(() =>
      validate('scale-timings', scaleTimings({ wide: 199 }), 'results'),
    ).toThrow(/scale-timings\.design\.fresh-process\.wide\.measured/);
    expect(() =>
      validate('scale-timings', scaleTimings({ wide: 200 }), 'results'),
    ).not.toThrow();
  });
  it('holds steady-get to 1,000 iterations under results/', () => {
    const file = scaleTimings();
    file.design['steady-get'] = design(999);
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.design\.steady-get\.measured/,
    );
  });
  it('requires every shape under results/ and accepts one under tmp/', () => {
    const file = scaleTimings();
    file.design['fresh-process'] = { mixed: design(1000) };
    expect(() => validate('scale-timings', file, 'results')).toThrow(
      /scale-timings\.design\.fresh-process\.wide/,
    );
    expect(() => validate('scale-timings', file, 'tmp')).not.toThrow();
  });
});
