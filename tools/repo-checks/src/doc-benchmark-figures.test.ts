import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkBenchmarkFigures,
  FIGURE,
  loadBenchmarks,
  type BenchmarkModules,
} from './docs/doc-benchmark-figures';
import { CONTENT, DOCS, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-benchmark-figures', name, 'content'));
const at = (path: string) =>
  `tools/repo-checks/src/__fixtures__/docs/doc-benchmark-figures/sabotaged/content/${path}`;

/** The docs fixture results, read through the docs app's own reader. */
async function fixtureBenchmarks(): Promise<BenchmarkModules> {
  const results = join(DOCS, 'tools/__fixtures__/benchmark-results');
  const tool = (name: string) => pathToFileURL(join(DOCS, 'tools', name)).href;
  const { buildBenchmarkData } = (await import(tool('benchmark-data.mjs'))) as {
    buildBenchmarkData: (input: object) => BenchmarkModules['data'];
  };
  const { lookup } = (await import(tool('benchmark-path.mjs'))) as {
    lookup: BenchmarkModules['lookup'];
  };
  return {
    data: buildBenchmarkData({
      results,
      libraries: JSON.parse(
        readFileSync(join(results, 'libraries.json'), 'utf8'),
      ).libraries,
      coreVersion: '0.4.0-rc.0',
      commitOf: () => null,
    }),
    lookup,
  };
}

describe('FIGURE', () => {
  it.each(['19 kB', '19.0 kB', '43 ms', '1,200 bytes', '2 µs', '12%', '3 s'])(
    'matches %s',
    (text) => expect(FIGURE.test(text)).toBe(true),
  );

  it.each([
    'Node 24',
    '1,000 iterations',
    'Meridian-8',
    '200 classes',
    'tsc-6',
  ])('leaves %s', (text) => expect(FIGURE.test(text)).toBe(false));
});

describe('doc-benchmark-figures fixtures', () => {
  it('passes a clean tree, code and pre-0.4.0 posts included', async () => {
    expect(
      checkBenchmarkFigures({
        pages: tree('clean'),
        benchmarks: await fixtureBenchmarks(),
      }),
    ).toEqual([]);
  });

  it('fails a figure in prose, a table or the description, and a path or run the results lack', async () => {
    expect(
      checkBenchmarkFigures({
        pages: tree('sabotaged'),
        benchmarks: await fixtureBenchmarks(),
      }),
    ).toEqual(
      [
        `${at('comparison.mdx')}: the description states '19 kB'. A description renders no component, so it names no figure.`,
        `${at('comparison.mdx')}:18: <Figure of="size.nexusdi.plain.esbuild.brotli">: "size.nexusdi.plain.esbuild.brotli": benchmarks/results holds no 'size.nexusdi.plain.esbuild.brotli'. Name a size entry the results file holds.`,
        `${at('comparison.mdx')}:20: <Figure of={path} /> has no of="…". Give the path as a string, so the guard can check it.`,
        `${at('comparison.mdx')}:22: <ProbeTable run="2020-01-01-0000000">: benchmarks/results/timings/ holds no such file.`,
        `${at('comparison.mdx')}:9: '19.0 kB' in prose. State it with <Figure of="…" /> from the benchmark results (docs spec section 4.6).`,
        `${at('comparison.mdx')}:13: '12%' in prose. State it with <Figure of="…" /> from the benchmark results (docs spec section 4.6).`,
      ].sort(),
    );
  });
});

describe('doc-benchmark-figures on apps/docs', () => {
  it('holds', async () => {
    expect(
      checkBenchmarkFigures({
        pages: readSite(CONTENT),
        benchmarks: await loadBenchmarks(),
      }),
    ).toEqual([]);
  });
});
