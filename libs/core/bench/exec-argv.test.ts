import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { execArgvFor } from './exec-argv.mjs';

const FLAG = '--max-inlined-bytecode-size-cumulative=4600';
const ROOT = join(import.meta.dirname, '..', '..', '..');

/** Every file under `dir`, skipping build output. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('K14 worker flags (benchmarks spec 14.6)', () => {
  it.each(['get-50', 'get-2000', 'get-modules'])(
    'raise the inlining budget for %s and keep --expose-gc',
    (name) => {
      expect(execArgvFor(name)).toEqual(['--expose-gc', FLAG]);
    },
  );

  it.each(['create-50', 'create-2000', 'lazy-read-50', 'createScope-50'])(
    'leave %s at V8 defaults',
    (name) => {
      expect(execArgvFor(name)).toEqual(['--expose-gc']);
    },
  );

  it('are accepted by the running Node', () => {
    const r = spawnSync(process.execPath, [
      ...execArgvFor('get-50'),
      '-e',
      '0',
    ]);
    expect(r.status).toBe(0);
  });

  it.each(['run.mjs', 'sensitivity.mjs'])(
    'reach both workers of a pair in %s through execArgvFor',
    (name) => {
      const src = readFileSync(join(import.meta.dirname, name), 'utf8');
      expect(src).toContain("from './exec-argv.mjs'");
      const forks = src.match(/forkWorker\([^)]*\)/g) ?? [];
      expect(forks).toHaveLength(2);
      for (const fork of forks) expect(fork).toMatch(/execArgvFor\(/);
    },
  );

  it('give sensitivity.mjs the get-50 flags', () => {
    const src = readFileSync(
      join(import.meta.dirname, 'sensitivity.mjs'),
      'utf8',
    );
    expect(src).toContain('execArgvFor(OP)');
    expect(src).toContain("const OP = 'get-50'");
  });

  it('give run.mjs the flags of the case being measured', () => {
    const src = readFileSync(join(import.meta.dirname, 'run.mjs'), 'utf8');
    expect(src).toContain('execArgvFor(name)');
  });

  it('stay out of the published benchmarks and the bench kit', () => {
    const paths = [
      join(ROOT, 'benchmarks', 'src'),
      join(ROOT, 'benchmarks', 'fixtures'),
      join(ROOT, 'tools', 'bench-kit', 'src'),
    ].flatMap(files);
    paths.push(
      ...readdirSync(join(ROOT, 'benchmarks'))
        .filter((name) => /\.config\.ts$/.test(name))
        .map((name) => join(ROOT, 'benchmarks', name)),
      join(ROOT, 'benchmarks', 'package.json'),
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toContain('max-inlined-bytecode');
      expect(text, path).not.toContain('exec-argv');
    }
  });
});
