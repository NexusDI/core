import { orderFor } from '@nexusdi/bench-kit';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

const dir = mkdtempSync(join(tmpdir(), 'scale-fresh-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const EMPTY_PACKAGES = join(dir, 'packages.mjs');
writeFileSync(EMPTY_PACKAGES, '');

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
      packagesFile: EMPTY_PACKAGES,
    };
  });

const opts = { block: 'mixed', warmup: 1, measured: 3, seed: 7 };
const INFLATE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'inflate-code-space.mjs',
);
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

  it('leaves the code spaces out of heap-ready', async () => {
    // Every heap read after the base adds 512 MB to code_space.
    const [row] = await freshBlock(cellsOf(['a']), {
      ...opts,
      warmup: 0,
      measured: 1,
      spawn: (script, args, execArgv, type, env) =>
        spawnChild(script, args, [...execArgv, '--import', INFLATE], type, env),
    });
    expect(row?.heapReady[0]).toBeLessThan(1_000_000);
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

  it('runs one block over every size in orderFor order', async () => {
    const cells = cellsOf(['a', 'b', 'c', 'd']);
    const seen: string[] = [];
    const rows = await freshBlock(cells, {
      ...opts,
      warmup: 1,
      measured: 2,
      spawn: (script, args, execArgv, type, env) => {
        seen.push(args[1] ?? '');
        return spawnChild(script, args, execArgv, type, env);
      },
    });
    const expected: string[] = [];
    for (let round = 0; round < 3; round++)
      for (const i of orderFor(round, 4, opts.seed))
        expected.push(cells[i]?.graph ?? '');
    expect(seen).toEqual(expected);
    expect(rows.map((r) => [r.library, r.size])).toEqual(
      cells.map((c) => [c.library, c.size]),
    );
  }, 120_000);

  it('holds exactly the rounds after warm-up in measured', async () => {
    const cells = cellsOf(['a', 'b', 'c']);
    let call = 0;
    const rows = await freshBlock(cells, {
      ...opts,
      warmup: 2,
      measured: 3,
      // Each synthetic sample carries its round in every phase.
      spawn: (() => {
        const round = Math.floor(call++ / cells.length);
        return Promise.resolve({
          ns: 0,
          message: {
            type: 'sample' as const,
            load: round,
            create: round,
            firstGet: round,
            rest: round,
            heapReady: round,
          },
        });
      }) as unknown as typeof spawnChild,
    });
    for (const row of rows) {
      expect(row.load).toEqual([2, 3, 4]);
      expect(row.startup).toEqual([8, 12, 16]);
      // The warm-up samples are kept apart, for the raw file (spec 8.3).
      expect(row.warmup.map((w) => w.load)).toEqual([0, 1]);
    }
  });

  it('imports the cell packages before the bundle, once', async () => {
    // fake-lib logs "lib" when it evaluates; the bundle logs "bundle" as its
    // first statement and imports fake-lib after that.
    const log = join(dir, 'cell', 'order.log');
    const lib = join(dir, 'cell', 'node_modules', 'fake-lib');
    mkdirSync(lib, { recursive: true });
    writeFileSync(
      join(lib, 'package.json'),
      '{"name":"fake-lib","type":"module","exports":"./index.js"}',
    );
    writeFileSync(
      join(lib, 'index.js'),
      "import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.FAKE_LOG, 'lib\\n');\nconst t = Date.now();\nwhile (Date.now() - t < 2000);\n",
    );
    const bundle = join(dir, 'cell', 'bundle.mjs');
    writeFileSync(
      bundle,
      `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LOG, 'bundle\\n');
await import('fake-lib');
export const { scale } = await import(${JSON.stringify(pathToFileURL(FAKE).href)});
`,
    );
    const graph = join(dir, 'cell', 'graph.json');
    writeFileSync(graph, JSON.stringify(six()));
    const packagesFile = join(dir, 'cell', 'packages.mjs');
    process.env.FAKE_LOG = log;
    const order = async (packages: string) => {
      writeFileSync(log, '');
      writeFileSync(packagesFile, packages);
      const [row] = await freshBlock(
        [{ library: 'x', size: 6, bundle, graph, packagesFile }],
        { ...opts, warmup: 0, measured: 1 },
      );
      return {
        order: readFileSync(log, 'utf8').trim().split('\n'),
        load: row?.load[0] ?? NaN,
      };
    };
    try {
      // The package is evaluated once, before the timed bundle import.
      const withFile = await order("import 'fake-lib';\n");
      expect(withFile.order).toEqual(['lib', 'bundle']);
      // fake-lib takes 2 s to evaluate: a load under 1 s means the import
      // sat outside the timed region, with a margin no scheduler eats.
      expect(withFile.load).toBeLessThan(1e9);
      // Without packages.mjs the bundle's own import evaluates it.
      expect((await order('')).order).toEqual(['bundle', 'lib']);
    } finally {
      delete process.env.FAKE_LOG;
    }
  }, 60_000);

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

describe('heap-ready under load', () => {
  it('is never negative in 150 parallel children', async () => {
    // V8's background compile jobs can still be running at the base read and
    // finish before the last one, which makes the difference negative.
    const graph = cellsOf(['x'])[0]?.graph ?? '';
    const results = await Promise.all(
      Array.from({ length: 150 }, () =>
        spawnChild<{ type: string; heapReady: number }>(
          CHILD,
          [FAKE, graph, EMPTY_PACKAGES],
          ['--expose-gc'],
          'sample',
        ),
      ),
    );
    const heap = results.map((r) => r.message.heapReady);
    expect(Math.min(...heap)).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

describe('spawnChild', () => {
  it('resolves with the first message and the spawn-to-message time', async () => {
    const r = await spawnChild<{ type: string }>(
      CHILD,
      [FAKE, cellsOf(['s'])[0]?.graph ?? '', EMPTY_PACKAGES],
      ['--expose-gc'],
      'sample',
    );
    expect(r.message.type).toBe('sample');
    expect(r.ns).toBeGreaterThan(0);
  }, 30_000);
  const script = (name: string, body: string) => {
    const file = join(dir, name);
    writeFileSync(file, body);
    return file;
  };
  it('ignores messages of another type', async () => {
    const file = script(
      'two.mjs',
      "process.send({ type: 'noise' }); process.send({ type: 'sample', v: 1 }); process.disconnect();",
    );
    const r = await spawnChild<{ type: string; v?: number }>(
      file,
      [],
      [],
      'sample',
    );
    expect(r.message.v).toBe(1);
  }, 30_000);
  it('rejects a non-zero exit even after the message', async () => {
    const file = script(
      'late.mjs',
      "process.send({ type: 'sample' }, () => { console.error('late'); process.exit(3); });",
    );
    await expect(spawnChild(file, [], [], 'sample')).rejects.toThrow(
      /exited with code 3: late/,
    );
  }, 30_000);
  it('names the signal when the child is killed', async () => {
    const file = script('kill.mjs', "process.kill(process.pid, 'SIGKILL');");
    await expect(spawnChild(file, [], [], 'sample')).rejects.toThrow(
      /exited with signal SIGKILL/,
    );
  }, 30_000);
  it('rejects when the child sends no message of the type', async () => {
    const file = script('quiet.mjs', '');
    await expect(spawnChild(file, [], [], 'sample')).rejects.toThrow(
      /sent no sample message/,
    );
  }, 30_000);
  it('keeps a message that arrives with the exit, under load', async () => {
    // Node may report the exit before it hands over the last IPC message.
    const file = script(
      'burst.mjs',
      "process.send({ type: 'sample', v: 1 }); process.exit(0);",
    );
    const results = await Promise.all(
      Array.from({ length: 60 }, () =>
        spawnChild<{ type: string; v: number }>(file, [], [], 'sample'),
      ),
    );
    expect(results.map((r) => r.message.v)).toEqual(new Array(60).fill(1));
  }, 60_000);
});
