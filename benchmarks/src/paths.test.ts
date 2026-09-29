import { describe, expect, it } from 'vitest';

import { indexResults, resolvePath } from './paths.ts';

const tree = {
  matrix: {
    tsyringe: { decorated: { esbuild: { outcome: 'runtime-error' } } },
  },
  timings: {
    tsyringe: {
      decorated: {
        ready: {
          median: 1200,
          vsNexus: { median: 0.4, low: 0.38, high: 0.42 },
        },
      },
    },
  },
  build: {
    headline: { tsyringe: { toolchain: 'tsc', vsNexus: { high: 0.9 } } },
  },
};

describe('resolvePath', () => {
  it('reads a matrix outcome', () => {
    expect(resolvePath(tree, 'matrix.tsyringe.decorated.esbuild.outcome')).toBe(
      'runtime-error',
    );
  });
  it('reads a paired ratio bound', () => {
    expect(
      resolvePath(tree, 'timings.tsyringe.decorated.ready.vsNexus.low'),
    ).toBe(0.38);
  });
  it('reads a headline field', () => {
    expect(resolvePath(tree, 'build.headline.tsyringe.vsNexus.high')).toBe(0.9);
  });
  it('keeps toolchain ids with a plus sign whole', () => {
    expect(
      resolvePath(
        { matrix: { a: { b: { 'vite8+babel-plugin': { outcome: 'pass' } } } } },
        'matrix.a.b.vite8+babel-plugin.outcome',
      ),
    ).toBe('pass');
  });
  it('throws on a path that does not resolve', () => {
    expect(() => resolvePath(tree, 'matrix.awilix.plain.tsc.outcome')).toThrow(
      /does not resolve at matrix\.awilix/,
    );
  });
});

const versions = {
  core: '0.4.0',
  libraries: {
    nexusdi: '0.4.0',
    inversify: '8.2.3',
    tsyringe: '4.10.0',
    awilix: '13.0.5',
    'needle-di': '1.2.1',
  },
  toolchains: {},
  node: '24.20.0',
};
const stats = {
  median: 10,
  mad: 1,
  p5: 9,
  p95: 12,
  iterations: 1000,
  noisy: false,
};
const ratio = { median: 0.5, low: 0.4, high: 0.6, pairs: 1000 };
const run = {
  schema: 1 as const,
  sha: 'abc1234',
  startedAt: '2026-10-01T04:00:00Z',
  versions,
  runner: { os: 'linux', cpu: 'x', cores: 4, memoryGb: 16, hosted: true },
  seed: 1,
};
const design = {
  order: 'williams' as const,
  warmup: 100,
  measured: 1000,
  bootstrap: {
    resamples: 10000 as const,
    block: 10,
    prng: 'mulberry32' as const,
  },
};

describe('indexResults', () => {
  it('indexes matrix cells by library, variant and toolchain', () => {
    const tree = indexResults({
      matrix: {
        schema: 1,
        versions,
        cells: [
          {
            library: 'tsyringe',
            variant: 'decorated',
            toolchain: 'esbuild',
            profile: 'legacy-metadata',
            sections: {
              singleton: 'runtime-error',
              transient: 'runtime-error',
              scoped: 'runtime-error',
            },
            outcome: 'runtime-error',
            polyfill: 'reflect-metadata@0.2.2',
          },
        ],
      },
    });
    expect(resolvePath(tree, 'matrix.tsyringe.decorated.esbuild.outcome')).toBe(
      'runtime-error',
    );
  });
  it('indexes probes by library, variant and probe', () => {
    const tree = indexResults({
      probes: {
        schema: 1,
        versions,
        probes: [
          {
            library: 'awilix',
            variant: 'plain',
            probe: 'cycle',
            detectedAt: 'first-resolve',
          },
        ],
      },
    });
    expect(resolvePath(tree, 'probes.awilix.plain.cycle.detectedAt')).toBe(
      'first-resolve',
    );
  });
  it('indexes sizes by bundler and emit counts by variant', () => {
    const tree = indexResults({
      size: {
        schema: 1,
        versions: {
          ...versions,
          bundlers: { esbuild: '0.28.2', rollup: '4.63.4' },
        },
        sizes: [
          {
            library: 'nexusdi',
            variant: 'plain',
            bundler: 'esbuild',
            minified: 40000,
            gzip: 12000,
            polyfillGzip: 0,
            runs: 'pass',
          },
        ],
        emit: [
          {
            library: 'inversify',
            variant: 'decorated',
            fixture: 'scale-200',
            toolchain: 'tsc',
            emittedBytes: 90000,
            metadataCalls: 200,
            decorateCalls: 200,
            importsInSource: 400,
            importsKept: 400,
          },
        ],
      },
    });
    expect(resolvePath(tree, 'size.nexusdi.plain.esbuild.gzip')).toBe(12000);
    expect(resolvePath(tree, 'emit.inversify.decorated.metadataCalls')).toBe(
      200,
    );
  });
  it('lifts the timing stats and keeps the paired ratio', () => {
    const tree = indexResults({
      timings: {
        ...run,
        design: { 'cold-start': design, 'in-process': design },
        results: [
          {
            scenario: 'cold-start',
            library: 'nexusdi',
            variant: 'plain',
            toolchain: 'tsc',
            batch: 1,
            stats,
          },
          {
            scenario: 'ready',
            library: 'tsyringe',
            variant: 'decorated',
            toolchain: 'tsc',
            batch: 10,
            stats,
            vsNexus: ratio,
          },
        ],
      },
    });
    expect(resolvePath(tree, 'timings.nexusdi.plain.cold-start.median')).toBe(
      10,
    );
    expect(
      resolvePath(tree, 'timings.tsyringe.decorated.ready.vsNexus.median'),
    ).toBe(0.5);
  });
  it('reads build cells, their meridian-8 figures and the headline', () => {
    const cell = {
      ...stats,
      outcome: 'pass' as const,
      headline: true,
      'meridian-8': stats,
    };
    const tree = indexResults({
      build: {
        ...run,
        design: { 'meridian-8': design, 'scale-200': design },
        build: {
          nexusdi: { plain: { tsc: cell, esbuild: cell } },
          inversify: { decorated: { tsc: { ...cell, vsNexus: ratio } } },
          tsyringe: {},
          awilix: {},
          'needle-di': {},
        },
        headline: {
          nexusdi: { variant: 'plain', toolchain: 'esbuild' },
          inversify: { variant: 'decorated', toolchain: 'tsc', vsNexus: ratio },
          tsyringe: { variant: 'decorated', toolchain: 'tsc', vsNexus: ratio },
          awilix: { variant: 'plain', toolchain: 'tsc', vsNexus: ratio },
          'needle-di': { variant: 'plain', toolchain: 'tsc', vsNexus: ratio },
        },
      },
    });
    expect(resolvePath(tree, 'build.nexusdi.plain.tsc.median')).toBe(10);
    expect(resolvePath(tree, 'build.inversify.decorated.tsc.vsNexus.low')).toBe(
      0.4,
    );
    expect(
      resolvePath(tree, 'build.nexusdi.plain.esbuild.meridian-8.mad'),
    ).toBe(1);
    expect(resolvePath(tree, 'build.headline.tsyringe.vsNexus.high')).toBe(0.6);
  });
});
