import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WORKER_EXEC_ARGV } from './exec-argv.mjs';

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
  it('raise the inlining budget and keep --expose-gc', () => {
    expect(WORKER_EXEC_ARGV).toEqual(['--expose-gc', FLAG]);
  });

  it('are accepted by the running Node', () => {
    const r = spawnSync(process.execPath, [...WORKER_EXEC_ARGV, '-e', '0']);
    expect(r.status).toBe(0);
  });

  it('reach both workers of a pair in run.mjs', () => {
    const run = readFileSync(join(import.meta.dirname, 'run.mjs'), 'utf8');
    expect(run).toContain("from './exec-argv.mjs'");
    const forks = run.match(/forkWorker\([^)]*\)/g) ?? [];
    expect(forks).toHaveLength(2);
    for (const fork of forks) expect(fork).toContain('WORKER_EXEC_ARGV');
  });

  it('stay out of the published benchmarks and the bench kit', () => {
    const paths = [
      join(ROOT, 'benchmarks', 'src'),
      join(ROOT, 'benchmarks', 'fixtures'),
      join(ROOT, 'tools', 'bench-kit', 'src'),
    ].flatMap(files);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toContain('max-inlined-bytecode');
      expect(text, path).not.toContain('exec-argv');
    }
  });
});
