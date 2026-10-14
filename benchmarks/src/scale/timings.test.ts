import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { median } from '@nexusdi/bench-kit';
import { afterAll, describe, expect, it } from 'vitest';

import type { LibraryId, Outcome, Variant } from '../schema.ts';
import type { Shape } from './config.ts';
import { localExponent } from './growth.ts';
import {
  coreTree,
  toScaleGrowth,
  toScaleMarginal,
  toScaleRows,
  type RawBlock,
  type RawScaleCell,
  type ScaleRaw,
} from './timings.ts';

/** A cell whose derived arrays are the per-round sums fresh.ts makes. */
function cell(
  library: LibraryId,
  variant: Variant,
  size: number,
  p: {
    load: number[];
    create: number[];
    firstGet: number[];
    rest: number[];
    heapReady: number[];
  },
  outcome: Outcome = 'pass',
): RawScaleCell {
  const ready = p.create.map(
    (c, i) => c + (p.firstGet[i] ?? 0) + (p.rest[i] ?? 0),
  );
  return {
    library,
    variant,
    size,
    outcome,
    ...p,
    firstResolve: p.load.map(
      (l, i) => l + (p.create[i] ?? 0) + (p.firstGet[i] ?? 0),
    ),
    ready,
    startup: p.load.map((l, i) => l + (ready[i] ?? 0)),
    warmup: [],
  };
}
/** Every phase one constant per round. */
const flat = (rounds: number[]) => ({
  load: rounds,
  create: rounds,
  firstGet: rounds,
  rest: rounds,
  heapReady: rounds,
});
const block = (shape: Shape, cells: RawScaleCell[]): RawBlock => ({
  shape,
  warmup: 1,
  measured: cells[0]?.load.length ?? 0,
  cells,
});
const raw = (...blocks: RawBlock[]): ScaleRaw => ({ blocks, steady: [] });
const find = (
  rows: ReturnType<typeof toScaleRows>,
  metric: string,
  library: string,
  shape: Shape,
  size: number,
) =>
  rows.find(
    (r) =>
      r.metric === metric &&
      r.library === library &&
      r.shape === shape &&
      r.size === size,
  );

describe('toScaleRows', () => {
  it('pairs a competitor with NexusDI plain from the same round, block and size', () => {
    const rows = toScaleRows(
      raw(
        block('mixed', [
          cell('nexusdi', 'plain', 50, flat([1, 2, 6])),
          cell('tsyringe', 'decorated', 50, flat([2, 1, 3])),
          cell('nexusdi', 'plain', 200, flat([10, 10, 10])),
          cell('tsyringe', 'decorated', 200, flat([40, 40, 40])),
        ]),
        block('wide', [
          cell('nexusdi', 'plain', 50, flat([10, 10, 10])),
          cell('tsyringe', 'decorated', 50, flat([20, 20, 20])),
        ]),
      ),
      1,
    );
    // Per-round ratios 0.5, 2 and 2: their median is 2, the ratio of the
    // medians would be 1.
    expect(
      find(rows, 'startup', 'tsyringe', 'mixed', 50)?.vsNexus?.median,
    ).toBe(2);
    expect(
      find(rows, 'startup', 'tsyringe', 'mixed', 200)?.vsNexus?.median,
    ).toBe(0.25);
    expect(find(rows, 'startup', 'tsyringe', 'wide', 50)?.vsNexus?.median).toBe(
      0.5,
    );
    expect(find(rows, 'startup', 'tsyringe', 'mixed', 50)?.vsNexus?.pairs).toBe(
      3,
    );
  });

  it('takes only NexusDI plain as the reference', () => {
    const rows = toScaleRows(
      raw(
        block('mixed', [
          cell('nexusdi', 'plain', 50, flat([1, 2, 3])),
          cell('nexusdi', 'decorated', 50, flat([2, 4, 6])),
        ]),
        block('wide', [
          cell('nexusdi', 'decorated', 50, flat([2, 4, 6])),
          cell('awilix', 'plain', 50, flat([2, 4, 6])),
        ]),
      ),
      1,
    );
    expect(
      find(rows, 'startup', 'nexusdi', 'mixed', 50)?.vsNexus,
    ).toBeUndefined();
    expect(
      rows.find(
        (r) =>
          r.library === 'nexusdi' &&
          r.variant === 'decorated' &&
          r.shape === 'mixed' &&
          r.metric === 'startup',
      )?.vsNexus?.median,
    ).toBe(0.5);
    // No plain NexusDI in the wide block: nothing to pair with.
    expect(
      rows.filter((r) => r.shape === 'wide' && r.vsNexus !== undefined),
    ).toEqual([]);
  });

  it('gives ratios to the five published metrics and none to the phases', () => {
    const rows = toScaleRows(
      raw(
        block('mixed', [
          cell('nexusdi', 'plain', 50, flat([1, 2, 3])),
          cell('awilix', 'plain', 50, flat([2, 4, 6])),
        ]),
      ),
      1,
    );
    const of = (metric: string) => find(rows, metric, 'awilix', 'mixed', 50);
    for (const m of ['load', 'create', 'first-get', 'rest']) {
      expect(of(m)).toBeDefined();
      expect(of(m)?.vsNexus).toBeUndefined();
    }
    for (const m of ['first-resolve', 'ready', 'startup', 'heap-ready'])
      expect(of(m)?.vsNexus?.median).toBe(0.5);
    expect(of('startup')?.unit).toBe('ns');
    expect(of('heap-ready')?.unit).toBe('bytes');
    expect(of('load')?.batch).toBe(1);
  });

  it('sums the phases per round before the median', () => {
    const rows = toScaleRows(
      raw(
        block('mixed', [
          cell('nexusdi', 'plain', 50, {
            load: [1, 100, 1],
            create: [100, 1, 1],
            firstGet: [1, 1, 100],
            rest: [1, 1, 1],
            heapReady: [1, 1, 1],
          }),
        ]),
      ),
      1,
    );
    // Rounds sum to 103, 103 and 103; the sum of the phase medians is 4.
    expect(find(rows, 'startup', 'nexusdi', 'mixed', 50)?.stats.median).toBe(
      103,
    );
    expect(find(rows, 'ready', 'nexusdi', 'mixed', 50)?.stats.median).toBe(102);
  });

  it('produces no rows for a cell that is not a pass', () => {
    const rows = toScaleRows(
      raw(
        block('mixed-async', [
          cell('nexusdi', 'plain', 50, flat([1, 2, 3])),
          cell('tsyringe', 'decorated', 50, flat([]), 'not-applicable'),
        ]),
      ),
      1,
    );
    expect(rows.some((r) => r.library === 'tsyringe')).toBe(false);
    expect(rows.some((r) => r.library === 'nexusdi')).toBe(true);
  });

  it('adds get-cycle rows from the steady samples, paired round by round', () => {
    const rows = toScaleRows(
      {
        blocks: [],
        steady: [
          {
            library: 'nexusdi',
            variant: 'plain',
            size: 50,
            batch: 8,
            warmup: [1],
            measured: [1, 2, 6],
          },
          {
            library: 'awilix',
            variant: 'plain',
            size: 50,
            batch: 4,
            warmup: [1],
            measured: [2, 1, 3],
          },
        ],
      },
      1,
    );
    const nexus = find(rows, 'get-cycle', 'nexusdi', 'mixed', 50);
    const awilix = find(rows, 'get-cycle', 'awilix', 'mixed', 50);
    expect(nexus?.vsNexus).toBeUndefined();
    expect(awilix?.batch).toBe(4);
    expect(awilix?.unit).toBe('ns');
    expect(awilix?.vsNexus?.median).toBe(2);
  });
});

describe('warm-up samples', () => {
  it('stay out of every row', () => {
    const c = cell('nexusdi', 'plain', 50, flat([1, 2, 3]));
    const base = toScaleRows(raw(block('mixed', [c])), 1);
    c.warmup = [
      { load: 1e12, create: 1e12, firstGet: 1e12, rest: 1e12, heapReady: 1e12 },
    ];
    expect(toScaleRows(raw(block('mixed', [c])), 1)).toEqual(base);
  });
});

describe('toScaleGrowth and toScaleMarginal', () => {
  const sizes = [50, 200, 1000, 5000];
  const rounds = [1, 2, 3, 4, 5, 6];
  const timesAt = (size: number) =>
    rounds.map((r) => r * (100_000 + 50 * size));
  const data = raw(
    block(
      'mixed',
      sizes.map((n) =>
        cell('nexusdi', 'plain', n, flat(timesAt(n).map((t) => t / 4))),
      ),
    ),
  );

  it('gives one local exponent per adjacent pair for startup and ready', () => {
    const g = toScaleGrowth(data, 1);
    const startup = g.filter((x) => x.metric === 'startup');
    expect(startup.map((x) => [x.from, x.to])).toEqual([
      [50, 200],
      [200, 1000],
      [1000, 5000],
    ]);
    expect(g.filter((x) => x.metric === 'ready')).toHaveLength(3);
    expect(startup[2]?.exponent).toBeCloseTo(
      localExponent(
        data.blocks[0]?.cells[2]?.startup ?? [],
        data.blocks[0]?.cells[3]?.startup ?? [],
        1000,
        5000,
        1,
      ).exponent,
      9,
    );
    expect(startup[2]?.shape).toBe('mixed');
  });

  it('gives the per-provider figure between 1,000 and 5,000 for startup and heap-ready', () => {
    const m = toScaleMarginal(data);
    const startup = m.find((x) => x.metric === 'startup');
    const cells = data.blocks[0]?.cells ?? [];
    expect(startup?.perProvider).toBeCloseTo(
      (median(cells[3]?.startup ?? []) - median(cells[2]?.startup ?? [])) /
        4000,
      9,
    );
    expect(m.map((x) => x.metric).sort()).toEqual(['heap-ready', 'startup']);
  });

  it('pairs only sizes that are adjacent, never across a missing one', () => {
    // 200 failed: 50 and 1,000 are not neighbours, but 1,000 and 5,000 are.
    const gap = raw(
      block(
        'mixed',
        [50, 1000, 5000].map((n) =>
          cell('nexusdi', 'plain', n, flat([1, 2, 3])),
        ),
      ),
    );
    expect(
      toScaleGrowth(gap, 1)
        .filter((x) => x.metric === 'startup')
        .map((x) => [x.from, x.to]),
    ).toEqual([[1000, 5000]]);
  });

  it('skips a library-variant that lacks 1,000 or 5,000', () => {
    const short = raw(
      block('wide', [
        cell('nexusdi', 'plain', 50, flat([1, 2])),
        cell('nexusdi', 'plain', 200, flat([1, 2])),
      ]),
    );
    expect(toScaleMarginal(short)).toEqual([]);
    expect(
      toScaleGrowth(short, 1).filter((x) => x.metric === 'startup'),
    ).toHaveLength(1);
  });
});

describe('coreTree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'core-tree-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  mkdirSync(join(dir, 'libs', 'core'), { recursive: true });
  writeFileSync(join(dir, '.gitignore'), 'dist\n');
  writeFileSync(join(dir, 'libs', 'core', 'a.ts'), 'export const a = 1;\n');
  // Tracked although ignored, as a committed build artefact would be.
  mkdirSync(join(dir, 'libs', 'core', 'dist'), { recursive: true });
  writeFileSync(join(dir, 'libs', 'core', 'dist', 'kept.js'), 'kept');
  git('init', '-q');
  git('add', '.');
  git('add', '-f', 'libs/core/dist/kept.js');
  git(
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '-m',
    'init',
  );

  it('is the tree SHA of libs/core at HEAD when the worktree matches', () => {
    expect(coreTree(dir)).toBe(git('rev-parse', 'HEAD:libs/core'));
  });
  it('follows the worktree, where release-core.ts restores a tag', () => {
    writeFileSync(join(dir, 'libs', 'core', 'a.ts'), 'export const a = 2;\n');
    expect(coreTree(dir)).not.toBe(git('rev-parse', 'HEAD:libs/core'));
  });
  it('ignores ignored build output', () => {
    const before = coreTree(dir);
    mkdirSync(join(dir, 'libs', 'core', 'dist'), { recursive: true });
    writeFileSync(join(dir, 'libs', 'core', 'dist', 'x.js'), 'x');
    expect(coreTree(dir)).toBe(before);
  });
  it('keeps tracked files that .gitignore covers', () => {
    // The committed tree has dist/kept.js; the scratch index must too.
    writeFileSync(join(dir, 'libs', 'core', 'a.ts'), 'export const a = 1;\n');
    expect(coreTree(dir)).toBe(git('rev-parse', 'HEAD:libs/core'));
  });
  it('leaves the real index alone', () => {
    writeFileSync(join(dir, 'libs', 'core', 'a.ts'), 'export const a = 3;\n');
    coreTree(dir);
    expect(git('diff', '--cached', '--name-only')).toBe('');
    expect(git('status', '--porcelain')).toContain('libs/core/a.ts');
  });
});
