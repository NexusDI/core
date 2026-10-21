import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { impurities, MODULE_LINE_LIMIT } from './meridian-purity.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'meridian-purity');

/** A fixture's text. The fixtures are .txt so lint, tsc and fallow skip them. */
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const source = (path: string, name: string) => ({
  path,
  text: fixture(name),
});

describe('impurities', () => {
  it.each([
    ['math-random.txt', 'Math.random'],
    ['date-now.txt', 'Date.now'],
    ['new-date.txt', 'new Date'],
    ['performance-now.txt', 'performance.now'],
    ['hrtime.txt', 'process.hrtime'],
  ])('reports %s', (name, call) => {
    const hits = impurities([source('src/x.ts', name)]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain(`src/x.ts:1 names ${call}`);
  });

  it('reports each timer on its own line', () => {
    const hits = impurities([source('src/timers.ts', 'timers.txt')]);
    expect(hits.map((hit) => hit.split(';')[0])).toEqual([
      'src/timers.ts:1 names setTimeout',
      'src/timers.ts:2 names setInterval',
      'src/timers.ts:3 names setImmediate',
    ]);
  });

  it('counts a comment as a hit', () => {
    expect(impurities([source('src/c.ts', 'comment.txt')])).toHaveLength(1);
  });

  it('reports a @nexusdi/ import under physics and allows it elsewhere', () => {
    const text = fixture('physics-imports-core.txt');
    expect(impurities([{ path: 'src/physics/gas.ts', text }])).toEqual([
      'src/physics/gas.ts:1 imports @nexusdi/; physics files stay free of DI',
    ]);
    expect(impurities([{ path: 'src/simulation/gas.ts', text }])).toEqual([]);
  });

  it('allows a physics file with relative imports', () => {
    expect(
      impurities([source('src/physics/gas.ts', 'physics-clean.txt')]),
    ).toEqual([]);
  });

  it('reports a module file over the line limit', () => {
    const long = `${'// line\n'.repeat(MODULE_LINE_LIMIT + 1)}`;
    const ok = `${'// line\n'.repeat(MODULE_LINE_LIMIT)}`;
    expect(
      impurities([{ path: 'src/big.module.ts', text: long }]),
    ).toHaveLength(1);
    expect(impurities([{ path: 'src/big.module.ts', text: ok }])).toEqual([]);
    expect(impurities([{ path: 'src/big.ts', text: long }])).toEqual([]);
  });

  it('accepts a clean tree', () => {
    expect(impurities([source('src/clean.ts', 'clean.txt')])).toEqual([]);
  });
});

/** Every .ts file under `dir`, with paths relative to the workspace root. */
function walk(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.name.endsWith('.ts')) return [];
    return [
      {
        path: relative(workspaceRoot, full),
        text: readFileSync(full, 'utf-8'),
      },
    ];
  });
}

describe('examples/meridian-systems/src', () => {
  const files = walk(join(workspaceRoot, 'examples/meridian-systems/src'));

  it('finds the library sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('holds the purity rules', () => {
    expect(impurities(files)).toEqual([]);
  });
});
