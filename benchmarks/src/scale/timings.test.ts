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
  coreRefOf,
  coreTree,
  judgeCells,
  type CellVerdict,
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

describe('judgeCells', () => {
  const v = (
    library: LibraryId,
    variant: Variant,
    shape: Shape,
    size: number,
    outcome: Outcome = 'pass',
    message?: string,
  ): CellVerdict => ({
    library,
    variant,
    shape,
    size,
    outcome,
    ...(message === undefined ? {} : { message }),
  });
  const base = [
    v('nexusdi', 'plain', 'mixed', 50),
    v('nexusdi', 'plain', 'mixed', 1000),
    v('inversify', 'decorated', 'mixed', 50),
  ];

  it('keeps every cell and aborts on none when all pass', () => {
    const r = judgeCells(base, []);
    expect(r.abort).toBeUndefined();
    expect(r.cells).toHaveLength(3);
  });
  it('skips and records a competitor that fails at scale after passing at 50', () => {
    const cells = [
      ...base,
      v(
        'inversify',
        'decorated',
        'mixed',
        1000,
        'runtime-error',
        'RangeError: stack',
      ),
      v(
        'inversify',
        'decorated',
        'mixed',
        5000,
        'compile-error',
        'TS2589: too deep',
      ),
    ];
    const r = judgeCells(cells, []);
    expect(r.abort).toBeUndefined();
    expect(
      r.cells.filter((c) => c.outcome !== 'pass').map((c) => c.size),
    ).toEqual([1000, 5000]);
  });
  it('aborts when a competitor fails at n = 50', () => {
    const r = judgeCells(
      [
        ...base.slice(0, 2),
        v(
          'awilix',
          'plain',
          'mixed',
          50,
          'compile-error',
          'TS2345: bad\n  at /x/y',
        ),
      ],
      [],
    );
    expect(r.abort).toMatch(
      /awilix\/plain mixed 50: compile-error \(TS2345: bad\)/,
    );
    expect(r.abort).not.toMatch(/\/x\/y/);
  });
  it('aborts on an equivalence fault at any size', () => {
    const r = judgeCells(
      [
        ...base,
        v('inversify', 'decorated', 'mixed', 1000, 'wrong-instance', 'built'),
      ],
      [],
    );
    expect(r.abort).toMatch(/inversify\/decorated mixed 1000: wrong-instance/);
  });
  it('aborts when a NexusDI plain cell fails at any size', () => {
    const r = judgeCells(
      [...base, v('nexusdi', 'plain', 'mixed', 5000, 'runtime-error', 'boom')],
      [],
    );
    expect(r.abort).toMatch(/nexusdi\/plain mixed 5000: runtime-error/);
  });
  it('aborts when the competitor cell at 50 is unknown, as no run proves it passes', () => {
    const r = judgeCells(
      [
        v('nexusdi', 'plain', 'mixed', 1000),
        v('awilix', 'plain', 'mixed', 1000, 'runtime-error', 'boom'),
      ],
      [],
    );
    expect(r.abort).toMatch(/awilix\/plain mixed 1000/);
  });
  it('takes the committed scale.json as proof of a pass at 50', () => {
    const r = judgeCells(
      [
        v('nexusdi', 'plain', 'mixed', 1000),
        v('awilix', 'plain', 'mixed', 1000, 'runtime-error', 'boom'),
      ],
      [v('awilix', 'plain', 'mixed', 50)],
    );
    expect(r.abort).toBeUndefined();
  });
  it('aborts when a cell contradicts scale.json at a size both cover', () => {
    const attemptedPass = judgeCells(base, [
      v('inversify', 'decorated', 'mixed', 50, 'runtime-error', 'old'),
    ]);
    expect(attemptedPass.abort).toMatch(/scale\.json/);
    const attemptedFail = judgeCells(
      [
        ...base,
        v('inversify', 'decorated', 'mixed', 1000, 'runtime-error', 'boom'),
      ],
      [v('inversify', 'decorated', 'mixed', 1000)],
    );
    expect(attemptedFail.abort).toMatch(/scale\.json/);
  });
  it('accepts a skipped cell that scale.json also records as failing', () => {
    const r = judgeCells(
      [
        ...base,
        v('inversify', 'decorated', 'mixed', 1000, 'runtime-error', 'boom'),
      ],
      [v('inversify', 'decorated', 'mixed', 1000, 'runtime-error', 'boom')],
    );
    expect(r.abort).toBeUndefined();
  });
  it('lets not-applicable cells through', () => {
    const r = judgeCells(
      [
        ...base,
        v(
          'tsyringe',
          'decorated',
          'mixed-async',
          50,
          'not-applicable',
          'no async',
        ),
      ],
      [],
    );
    expect(r.abort).toBeUndefined();
  });
  it('judges each shape on its own n = 50 cell', () => {
    const r = judgeCells(
      [
        v('nexusdi', 'plain', 'wide', 50),
        v('inversify', 'decorated', 'mixed', 50),
        v('inversify', 'decorated', 'wide', 1000, 'runtime-error', 'boom'),
        v('nexusdi', 'plain', 'wide', 1000),
      ],
      [],
    );
    expect(r.abort).toMatch(/inversify\/decorated wide 1000/);
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

describe('coreRefOf', () => {
  const dir = mkdtempSync(join(tmpdir(), 'core-ref-of-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd: dir, encoding: 'utf8' },
    ).trim();
  mkdirSync(join(dir, 'libs', 'core'), { recursive: true });
  writeFileSync(join(dir, 'libs', 'core', 'a.ts'), '1\n');
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'one');
  git('tag', 'old');
  writeFileSync(join(dir, 'libs', 'core', 'a.ts'), '2\n');
  git('commit', '-qam', 'two');
  git('tag', 'new');
  const tree = git('rev-parse', 'HEAD:libs/core');

  it('records a ref from the file whose libs/core is the one packed', () => {
    expect(coreRefOf({ fromFile: 'new' }, dir)).toEqual({ ref: 'new', tree });
  });
  it('records workspace for a stale file whose ref has another tree', () => {
    expect(coreRefOf({ fromFile: 'old' }, dir)).toEqual({
      ref: 'workspace',
      tree,
    });
  });
  it('records workspace when the file names a ref git cannot resolve', () => {
    expect(coreRefOf({ fromFile: 'gone' }, dir).ref).toBe('workspace');
  });
  it('records workspace with no flag and no file', () => {
    expect(coreRefOf({}, dir).ref).toBe('workspace');
  });
  it('records a matching --core-ref', () => {
    expect(coreRefOf({ explicit: 'new' }, dir).ref).toBe('new');
  });
  it('throws on a --core-ref whose tree differs: a false claim fails the run', () => {
    expect(() => coreRefOf({ explicit: 'old', fromFile: 'new' }, dir)).toThrow(
      /--core-ref old/,
    );
  });
  it('throws on a --core-ref git cannot resolve', () => {
    expect(() => coreRefOf({ explicit: 'gone' }, dir)).toThrow(
      /--core-ref gone/,
    );
  });
  it('takes the flag over the file', () => {
    expect(coreRefOf({ explicit: 'new', fromFile: 'old' }, dir).ref).toBe(
      'new',
    );
  });
});
