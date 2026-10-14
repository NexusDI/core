import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { BENCHMARKS, FIXTURES, readLibraries } from '../libraries.ts';
import {
  bundleCell,
  compileCell,
  pool,
  runCell,
  scaleCell,
  stageCell,
} from './cells.ts';
import { SHAPES } from './config.ts';
import { graphOf } from './shapes.ts';
import { six } from './six.ts';

// A stand-in for the throwaway consumer: the profile configs and the
// workspace's node_modules, which hold typescript, tslib and the built
// @nexusdi/core. Under benchmarks/, so a bundle resolves its packages.
// Its own directory per run, so overlapping runs never delete each other's cells.
mkdirSync(join(BENCHMARKS, 'tmp'), { recursive: true });
const DIR = mkdtempSync(join(BENCHMARKS, 'tmp', 'cells-test-'));
cpSync(join(FIXTURES, 'config'), join(DIR, 'config'), { recursive: true });
symlinkSync(
  join(BENCHMARKS, '..', 'node_modules'),
  join(DIR, 'node_modules'),
  'dir',
);
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('pool', () => {
  it('runs at most four jobs at once and keeps input order', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 13 }, (_, i) => i);
    const results = await pool(items, async (i) => {
      active++;
      peak = Math.max(peak, active);
      // Later items finish first, so completion order differs from input order.
      await sleep(2 + ((13 - i) % 5) * 3);
      active--;
      return i * 10;
    });
    expect(peak).toBe(4);
    expect(results).toEqual(items.map((i) => i * 10));
  });

  it('rejects when a job throws', async () => {
    await expect(
      pool([1, 2, 3], async (i) => {
        if (i === 2) throw new Error('job broke');
        return i;
      }),
    ).rejects.toThrow('job broke');
  });
});

function nexusdi() {
  const lib = readLibraries().libraries.find((l) => l.id === 'nexusdi');
  if (lib === undefined) throw new Error('libraries.json lost nexusdi');
  return lib;
}

describe('runCell', () => {
  for (const shape of SHAPES)
    it(`passes the NexusDI plain ${shape} cell at n = 50 through compile, bundle and verify`, async () => {
      const result = await scaleCell(
        DIR,
        nexusdi(),
        'plain',
        graphOf(shape, 50),
      );
      expect(result.outcome).toBe('pass');
      expect(result.message).toBeUndefined();
      expect(readFileSync(result.bundle ?? '', 'utf8')).toMatch(
        /from ["']@nexusdi\/core["']/,
      );
    }, 120_000);

  it('records a failing compile as compile-error with the cell path stripped', async () => {
    const result = await runCell(
      DIR,
      'broken',
      { 'app.ts': 'export const scale: string = 42;\n' },
      six(),
      'none',
    );
    expect(result).toMatchObject({
      outcome: 'compile-error',
      message:
        "src/app.ts: error TS2322: Type 'number' is not assignable to type 'string'.",
    });
  }, 120_000);
});

describe('scaleCell', () => {
  it('records an async graph as not-applicable for a library with no async resolution', async () => {
    for (const lib of readLibraries().libraries) {
      const reason = lib.notApplicable['async-factory'];
      if (reason === undefined) continue;
      const variant = lib.id === 'awilix' ? 'plain' : 'decorated';
      // No cell is staged, so DIR holds no installed library.
      await expect(
        scaleCell(DIR, lib, variant, graphOf('mixed-async', 50)),
      ).resolves.toEqual({ outcome: 'not-applicable', message: reason });
    }
  });
});

describe('bundleCell', () => {
  it('holds one __decorate for a decorated two-module cell', async () => {
    const tag =
      'export const tag = (): ClassDecorator => (target) => target;\n';
    const module = (name: string) =>
      `import { tag } from './tag.ts';\n\n@tag()\nexport class ${name} {}\n@tag()\nexport class ${name}Too {}\n`;
    const cellDir = stageCell(
      DIR,
      'decorated',
      {
        'tag.ts': tag,
        'm0.ts': module('M0'),
        'm1.ts': module('M1'),
        'app.ts':
          "import { M0 } from './m0.ts';\nimport { M1 } from './m1.ts';\n\nexport const scale = [M0, M1];\n",
      },
      six(),
      'legacy',
    );
    const bundle = await bundleCell(
      cellDir,
      await compileCell(cellDir, 'legacy'),
    );
    const text = readFileSync(bundle, 'utf8');
    // esbuild renames a second per-file copy to __decorate2.
    expect(text.match(/(?:var|function) __decorate\d*\b/g)).toHaveLength(1);
    expect(text).not.toMatch(/from ["']tslib["']/);
  }, 120_000);
  it('writes packages.mjs beside the bundle, polyfill first, no builtins or tslib', async () => {
    const cellDir = stageCell(
      DIR,
      'packages',
      { 'app.ts': '' },
      six(),
      'legacy',
    );
    writeFileSync(
      join(cellDir, 'app.js'),
      "import 'b-lib';\nimport { readFileSync } from 'node:fs';\nimport 'tslib';\nimport 'reflect-metadata';\nexport const scale = { readFileSync };\n",
    );
    await bundleCell(cellDir, 'app.js');
    expect(readFileSync(join(cellDir, 'packages.mjs'), 'utf8')).toBe(
      "import 'reflect-metadata';\nimport 'b-lib';\n",
    );
  });
});
