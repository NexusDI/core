import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// A throwaway one-file fixture, not the workspace's real one, so the
// esbuild bundle stays a one-file, no-nx-build affair: cheap enough to
// exercise the swallow/throw policy without the real fixture or a build.
const { measure } = (await import(
  pathToFileURL(join(workspaceRoot, 'scripts', 'size-report.mjs')).href
)) as {
  measure(
    fixture: string,
    root: string,
    file: string,
    swallow: boolean,
  ): Promise<number | null>;
};

describe('measure', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'size-report-test-'));
    writeFileSync(join(dir, 'ok.ts'), 'export const x = 1;\nconsole.log(x);\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('measures a fixture that bundles', async () => {
    const size = await measure(dir, dir, 'ok.ts', false);
    expect(size).toBeGreaterThan(0);
  });

  it('reports no figure for a fixture that fails to bundle, when told to swallow the error (the merge base, R22)', async () => {
    expect(await measure(dir, dir, 'missing.ts', true)).toBeNull();
  });

  it('throws for a fixture that fails to bundle when not swallowing (this pull request, fix round 1)', async () => {
    await expect(measure(dir, dir, 'missing.ts', false)).rejects.toThrow();
  });
});
