import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { libDirs } from './entry-graph.js';
import { type CopyAllowance, noCopies } from './no-copies.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'no-copies');

/**
 * The `duplicates.ignore` globs that may span packages (spec section 1.5).
 * Each matches test-support files only, which no package publishes. A glob
 * that leaves the config or stops spanning packages fails the live test, so
 * the list cannot go stale.
 */
const ALLOWLIST: readonly CopyAllowance[] = [
  {
    glob: 'libs/*/test-support/error-cases.ts',
    reason:
      "test-support, outside published source: each package's tests reach only their own test-support and core's package entry",
  },
  {
    glob: 'libs/*/test-support/security.ts',
    reason:
      "test-support, outside published source: core's SEC-009 and devtools' SEC-010 each compile the chain from their own test-support",
  },
];

const FIXTURE_ALLOWANCE: CopyAllowance = {
  glob: 'libs/*/test-support/error-cases.ts',
  reason: 'fixture',
};

describe('noCopies', () => {
  it('accepts ignores of config, tests and one package, and an allowed glob', () => {
    const result = noCopies(join(FIXTURES, 'clean'), [FIXTURE_ALLOWANCE]);
    expect(result.violations).toEqual([]);
    expect(result.used).toEqual(new Set([FIXTURE_ALLOWANCE.glob]));
  });

  it('reports the allowed glob when no allowance names it', () => {
    expect(noCopies(join(FIXTURES, 'clean'), []).violations).toEqual([
      'duplicates.ignore holds libs/*/test-support/error-cases.ts, which spans libs/core and libs/errors; export the shared helper from its owner',
    ]);
  });

  it('reports each ignore that spans packages and each copy marker under src/', () => {
    expect(noCopies(join(FIXTURES, 'sabotaged'), []).violations).toEqual([
      'duplicates.ignore holds libs/*/src/describe.ts, which spans libs/core and libs/errors; export the shared helper from its owner',
      'duplicates.ignore holds libs/{core,errors}/test-support/**, which spans libs/core and libs/errors; export the shared helper from its owner',
      'duplicates.ignore holds **/describe.ts, which spans libs/core and libs/errors; export the shared helper from its owner',
      'libs/core/src/copy.test.ts:1 says "keep them in step with libs/"; export the shared helper from its owner',
      'libs/errors/src/copy.ts:1 says "keep them in step with libs/"; export the shared helper from its owner',
      'libs/errors/src/copy.ts:4 says "keep them in step with libs/"; export the shared helper from its owner',
    ]);
  });

  const live = noCopies(workspaceRoot, ALLOWLIST);

  it('scans every package in libs/, with ignores and files to check', () => {
    expect(live.scanned.packages).toBe(
      libDirs(join(workspaceRoot, 'libs')).length,
    );
    expect(live.scanned.globs).toBeGreaterThan(0);
    expect(live.scanned.files).toBeGreaterThan(0);
  });

  it('holds for the workspace', () => {
    expect(live.violations).toEqual([]);
  });

  it('uses every allowance', () => {
    expect(
      ALLOWLIST.map((entry) => entry.glob).filter(
        (glob) => !live.used.has(glob),
      ),
    ).toEqual([]);
  });
});
