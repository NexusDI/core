// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXTRA_PATHS, PATHS, touches } from './docs-changed.mjs';

describe('the docs inputs', () => {
  it('name every workflow that builds or checks the site', () => {
    expect(EXTRA_PATHS).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/docs-next.yml',
      '.github/workflows/docs-snapshot.yml',
    ]);
  });
});

describe('touches', () => {
  it('matches a file under a /** path and an exact file', () => {
    expect(touches(PATHS, ['libs/core/src/index.ts'])).toBe(true);
    expect(touches(PATHS, ['package-lock.json'])).toBe(true);
    expect(touches(PATHS, ['.github/workflows/docs-next.yml'])).toBe(true);
    expect(touches(PATHS, ['benchmarks/results/size.json'])).toBe(true);
  });

  it('ignores a change outside every docs input', () => {
    expect(touches(PATHS, ['README.md', 'tools/release/stage.mjs'])).toBe(
      false,
    );
    expect(touches(PATHS, ['apps/docs-e2e/src/home.spec.ts'])).toBe(false);
  });
});

describe('the command line', () => {
  it('reports a touched change when the base commit is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docs-changed-'));
    const output = join(dir, 'out');
    const script = fileURLToPath(
      new URL('./docs-changed.mjs', import.meta.url),
    );
    const run = spawnSync('node', [script, 'f'.repeat(40)], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('the base commit is not in the clone');
    expect(readFileSync(output, 'utf8')).toBe('touched=true\n');
  });
});
