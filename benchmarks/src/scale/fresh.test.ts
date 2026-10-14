import { orderFor } from '@nexusdi/bench-kit';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { spawnChild } from '../timings/spawn.ts';
import { retainedHeap } from './heap.mjs';
import { freshBlock, type FreshCell } from './fresh.ts';
import { six } from './six.ts';

const CHILD = join(import.meta.dirname, 'child.mjs');
const FAKE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'fake-scale.mjs',
);

// A heap figure needs a body: without ballast it is a few KB of noise.
process.env.FAKE_BALLAST = '1';

const dir = mkdtempSync(join(tmpdir(), 'scale-fresh-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** One graph file per cell, so a recorded spawn names its cell. */
const cellsOf = (names: string[]): FreshCell[] =>
  names.map((name, i) => {
    const graph = join(dir, `${name}.json`);
    writeFileSync(graph, JSON.stringify(six()));
    return {
      library: name,
      size: 50 * 4 ** i,
      bundle: FAKE,
      graph,
      packages: [],
    };
  });

const opts = { block: 'mixed', warmup: 1, measured: 3, seed: 7 };
const PHASES = ['load', 'create', 'firstGet', 'rest', 'heapReady'] as const;

describe('freshBlock', () => {
  it('reports every phase, all non-negative, once per measured round', async () => {
    const [row] = await freshBlock(cellsOf(['a']), opts);
    expect(row?.library).toBe('a');
    for (const phase of PHASES) {
      expect(row?.[phase]).toHaveLength(3);
      for (const v of row?.[phase] ?? []) expect(v).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);

  it('derives first-resolve, ready and startup as sums of the phases per round', async () => {
    const [row] = await freshBlock(cellsOf(['a']), opts);
    if (row === undefined) throw new Error('no row');
    for (let r = 0; r < 3; r++) {
      const [load, create, firstGet, rest] = [
        row.load[r] ?? NaN,
        row.create[r] ?? NaN,
        row.firstGet[r] ?? NaN,
        row.rest[r] ?? NaN,
      ];
      expect(row.firstResolve[r]).toBe(load + create + firstGet);
      expect(row.ready[r]).toBe(create + firstGet + rest);
      expect(row.startup[r]).toBe(load + (row.ready[r] ?? NaN));
    }
  }, 60_000);

  it('keeps heap-ready within 1% when a large function compiles and runs hot', async () => {
    const cells = cellsOf(['a']);
    const heap = async (extra: Record<string, string>) => {
      const saved = { ...process.env };
      Object.assign(process.env, extra);
      try {
        const [row] = await freshBlock(cells, {
          ...opts,
          warmup: 0,
          measured: 1,
        });
        return row?.heapReady[0] ?? NaN;
      } finally {
        for (const k of Object.keys(extra)) delete process.env[k];
        Object.assign(process.env, saved);
      }
    };
    const diag = join(dir, 'code-space');
    const plain = await heap({});
    const compiled = await heap({ FAKE_COMPILE: '1', FAKE_DIAG: diag });
    // The premise: the compile did grow code_space in the child.
    expect(Number(readFileSync(diag, 'utf8'))).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(20_000_000);
    expect(Math.abs(compiled - plain) / plain).toBeLessThan(0.01);
  }, 60_000);

  it('rejects when the counts fall short, naming cell, block and round', async () => {
    process.env.FAKE_BREAK = 'no-report';
    try {
      await expect(freshBlock(cellsOf(['a']), opts)).rejects.toThrow(
        /a\/50 fresh-process block mixed round 0: exited with code 1.*construction/s,
      );
    } finally {
      delete process.env.FAKE_BREAK;
    }
  }, 60_000);

  it('runs one block over every size, in orderFor order, and drops warm-up', async () => {
    const cells = cellsOf(['a', 'b', 'c', 'd']);
    const seen: string[] = [];
    const rows = await freshBlock(cells, {
      ...opts,
      warmup: 2,
      measured: 2,
      spawn: (script, args, execArgv, env) => {
        seen.push(args[1] ?? '');
        return spawnChild(script, args, execArgv, env);
      },
    });
    const expected: string[] = [];
    for (let round = 0; round < 4; round++)
      for (const i of orderFor(round, 4, opts.seed))
        expected.push(cells[i]?.graph ?? '');
    expect(seen).toEqual(expected);
    expect(rows.map((r) => [r.library, r.size])).toEqual(
      cells.map((c) => [c.library, c.size]),
    );
    for (const row of rows) expect(row.startup).toHaveLength(2);
  }, 120_000);

  it('rejects with the child stderr when it exits 1 before sending', async () => {
    const cells = cellsOf(['a']).map((c) => ({
      ...c,
      bundle: join(dir, 'missing.mjs'),
    }));
    await expect(freshBlock(cells, opts)).rejects.toThrow(
      /a\/50 fresh-process block mixed round 0: exited with code 1: .*missing\.mjs/s,
    );
  }, 60_000);
});

describe('retainedHeap', () => {
  it('sums every space but the code spaces', () => {
    const space = (space_name: string, space_used_size: number) => ({
      space_name,
      space_used_size,
    });
    expect(
      retainedHeap([
        space('read_only_space', 1),
        space('old_space', 20),
        space('code_space', 4000),
        space('code_large_object_space', 9000),
        space('new_space', 300),
      ]),
    ).toBe(321);
  });
});

describe('spawnChild', () => {
  it('resolves with the first message and the spawn-to-message time', async () => {
    const r = await spawnChild<{ type: string }>(
      CHILD,
      [FAKE, cellsOf(['s'])[0]?.graph ?? ''],
      ['--expose-gc'],
    );
    expect(r.message.type).toBe('sample');
    expect(r.ns).toBeGreaterThan(0);
  }, 30_000);
});
