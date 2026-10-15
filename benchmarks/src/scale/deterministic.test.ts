import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapesArg, sizesArg, writeResult } from '../cli.ts';
import type { ScaleCell, ScaleSizeRow } from '../schema.ts';
import { describeGraph } from './graph.ts';
import { graphOf } from './shapes.ts';
import {
  assembleScale,
  coverage,
  perProvider,
  round2,
} from './deterministic.ts';

const versions = {
  core: '0.4.0-rc.0',
  libraries: {
    nexusdi: '0.4.0-rc.0',
    inversify: '8.2.3',
    tsyringe: '4.10.0',
    awilix: '13.0.5',
    'needle-di': '1.2.1',
  },
  toolchains: { tsc: '6.0.3' },
  node: '24.20.0',
  bundlers: { esbuild: '0.28.2' },
  tslib: '2.8.1',
};

const sizeRow = (
  library: ScaleSizeRow['library'],
  size: number,
  minified: number,
  gzip: number,
): ScaleSizeRow => ({
  library,
  variant:
    library === 'nexusdi' || library === 'awilix' ? 'plain' : 'decorated',
  shape: 'mixed',
  size,
  minified,
  gzip,
});

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(41.256)).toBe(41.26);
    expect(round2(41.254)).toBe(41.25);
    expect(round2(-0.004)).toBe(-0);
    expect(round2(12)).toBe(12);
  });
});

describe('perProvider', () => {
  it('is the difference quotient between 1,000 and 5,000, minified and gzip', () => {
    const rows = [
      sizeRow('nexusdi', 50, 30_000, 9_000),
      sizeRow('nexusdi', 200, 60_000, 14_000),
      sizeRow('nexusdi', 1000, 200_000, 40_000),
      sizeRow('nexusdi', 5000, 1_000_123, 205_001),
    ];
    expect(perProvider(rows)).toEqual([
      {
        library: 'nexusdi',
        variant: 'plain',
        shape: 'mixed',
        bytes: 'minified',
        perProvider: 200.03,
      },
      {
        library: 'nexusdi',
        variant: 'plain',
        shape: 'mixed',
        bytes: 'gzip',
        perProvider: 41.25,
      },
    ]);
  });
  it('skips a library-variant missing either size', () => {
    expect(
      perProvider([
        sizeRow('awilix', 1000, 100, 10),
        sizeRow('tsyringe', 5000, 500, 50),
      ]),
    ).toEqual([]);
  });
});

describe('coverage', () => {
  it('holds every shape at 50, 200, 1,000 and 2,500, and mixed alone at 5,000', () => {
    const cells = coverage(
      ['mixed', 'wide', 'deep', 'modular', 'mixed-async'],
      [50, 200, 1000, 2500, 5000],
    );
    expect(cells).toHaveLength(21);
    expect(cells.filter((c) => c.size === 5000)).toEqual([
      { shape: 'mixed', size: 5000 },
    ]);
  });
  it('narrows to the shapes and sizes asked for', () => {
    expect(coverage(['wide', 'mixed'], [5000, 50])).toEqual([
      { shape: 'wide', size: 50 },
      { shape: 'mixed', size: 5000 },
      { shape: 'mixed', size: 50 },
    ]);
  });
});

describe('assembleScale', () => {
  const cell = (
    library: ScaleCell['library'],
    shape: ScaleCell['shape'],
    size: number,
  ): ScaleCell => ({
    library,
    variant:
      library === 'nexusdi' || library === 'awilix' ? 'plain' : 'decorated',
    shape,
    size,
    outcome: 'pass',
  });
  const file = assembleScale({
    versions,
    graphs: [
      describeGraph(graphOf('wide', 200)),
      describeGraph(graphOf('mixed', 200)),
      describeGraph(graphOf('wide', 50)),
      describeGraph(graphOf('mixed-async', 50)),
    ],
    cells: [
      cell('tsyringe', 'mixed', 50),
      cell('awilix', 'wide', 200),
      cell('awilix', 'wide', 50),
      cell('awilix', 'mixed', 1000),
    ],
    sizes: [
      sizeRow('tsyringe', 5000, 5, 5),
      sizeRow('awilix', 5000, 900, 90),
      sizeRow('awilix', 1000, 100, 10),
      sizeRow('tsyringe', 1000, 1, 1),
    ],
  });

  it('records the graph seed and schema 1', () => {
    expect(file.schema).toBe(1);
    expect(file.graphSeed).toBe(20261001);
  });
  it('sorts graphs by shape in SHAPES order, then size', () => {
    expect(file.graphs.map((g) => `${g.shape}@${g.size}`)).toEqual([
      'mixed@200',
      'wide@50',
      'wide@200',
      'mixed-async@50',
    ]);
  });
  it('sorts cells by library, variant, shape, size', () => {
    expect(file.cells.map((c) => `${c.library}/${c.shape}@${c.size}`)).toEqual([
      'awilix/mixed@1000',
      'awilix/wide@50',
      'awilix/wide@200',
      'tsyringe/mixed@50',
    ]);
  });
  it('sorts sizes by library, variant, size', () => {
    expect(file.sizes.map((s) => `${s.library}@${s.size}`)).toEqual([
      'awilix@1000',
      'awilix@5000',
      'tsyringe@1000',
      'tsyringe@5000',
    ]);
  });
  it('sorts perProvider by library, variant, minified before gzip', () => {
    expect(
      file.perProvider.map((p) => `${p.library}/${p.bytes}=${p.perProvider}`),
    ).toEqual([
      'awilix/minified=0.2',
      'awilix/gzip=0.02',
      'tsyringe/minified=0',
      'tsyringe/gzip=0',
    ]);
  });
});

describe('sizesArg and shapesArg', () => {
  it('reads the lists, or undefined when absent', () => {
    expect(sizesArg(['node', 'x', '--sizes=50,1000'])).toEqual([50, 1000]);
    expect(sizesArg(['node', 'x'])).toBeUndefined();
    expect(shapesArg(['node', 'x', '--shapes=wide,mixed-async'])).toEqual([
      'wide',
      'mixed-async',
    ]);
  });
  it('rejects a size or shape the suite does not have', () => {
    expect(() => sizesArg(['node', 'x', '--sizes=50,300'])).toThrow(/300/);
    expect(() => shapesArg(['node', 'x', '--shapes=layered'])).toThrow(
      /layered/,
    );
  });
});

describe('writeResult --check', () => {
  let root = '';
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const scale = assembleScale({
    versions,
    graphs: [describeGraph(graphOf('mixed', 50))],
    cells: [],
    sizes: [],
  });
  const exit = () =>
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

  it('exits 1 when the file it replaced differs, after writing the new one', () => {
    root = mkdtempSync(join(tmpdir(), 'scale-check-'));
    mkdirSync(join(root, 'results'));
    writeFileSync(join(root, 'results', 'scale.json'), '{}\n');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exit();
    expect(() =>
      writeResult('scale', scale, false, { root, check: true }),
    ).toThrow('exit 1');
    expect(
      JSON.parse(readFileSync(join(root, 'results', 'scale.json'), 'utf8')),
    ).toEqual(scale);
  });
  it('passes when the file is unchanged', () => {
    root = mkdtempSync(join(tmpdir(), 'scale-check-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const spy = exit();
    writeResult('scale', scale, false, { root, check: false });
    writeResult('scale', scale, false, { root, check: true });
    expect(spy).not.toHaveBeenCalled();
  });
  it('writes a partial run under tmp/', () => {
    root = mkdtempSync(join(tmpdir(), 'scale-check-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    writeResult('scale', scale, true, { root, check: false });
    expect(readFileSync(join(root, 'tmp', 'scale.json'), 'utf8')).toContain(
      '"graphSeed": 20261001',
    );
  });
});
