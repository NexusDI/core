import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// A throwaway one-file fixture, not the workspace's real one, so the
// esbuild bundle stays a one-file, no-nx-build affair: cheap enough to
// exercise the swallow/throw policy without the real fixture or a build.
const { measure, measurePackages } = (await import(
  pathToFileURL(join(workspaceRoot, 'scripts', 'size-report.mjs')).href
)) as {
  measure(
    fixture: string,
    root: string,
    file: string,
    swallow: boolean,
  ): Promise<number | null>;
  measurePackages(
    fixture: string,
    root: string,
    libs: readonly string[],
    core: number | null,
    swallow: boolean,
  ): Promise<Record<string, number | null>>;
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

describe('measurePackages', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'size-report-test-'));
    writeFileSync(join(dir, 'core.ts'), 'console.log(1);\n');
    writeFileSync(join(dir, 'pkg.ts'), 'console.log(1, "pkg");\n');
    writeFileSync(
      join(dir, 'pkg-text.ts'),
      'console.log(1, "a text pack with more words in it");\n',
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports core's own pack as `core/text`, and core itself under no package name", async () => {
    writeFileSync(join(dir, 'core-text.ts'), 'console.log(1, "core text");\n');
    const core = (await measure(dir, dir, 'core.ts', false)) as number;
    const text = (await measure(dir, dir, 'core-text.ts', false)) as number;
    const packages = await measurePackages(dir, dir, ['core'], core, false);
    expect(packages).toEqual({ 'core/text': text - core });
  });

  it('reports a `<dir>-text.ts` fixture under `<dir>/text`, minus core', async () => {
    const core = (await measure(dir, dir, 'core.ts', false)) as number;
    const text = (await measure(dir, dir, 'pkg-text.ts', false)) as number;
    const packages = await measurePackages(
      dir,
      dir,
      ['core', 'pkg'],
      core,
      false,
    );
    expect(Object.keys(packages)).toEqual(['pkg', 'pkg/text']);
    expect(packages['pkg/text']).toBe(text - core);
  });

  it('reports nothing for a package with no fixture of its own', async () => {
    const packages = await measurePackages(
      dir,
      dir,
      ['core', 'pkg', 'bare'],
      0,
      false,
    );
    expect(Object.keys(packages)).toEqual(['pkg', 'pkg/text']);
  });

  it('reports no figure for a pack fixture that fails to bundle, when told to swallow the error', async () => {
    writeFileSync(
      join(dir, 'pkg-text.ts'),
      "import { x } from './missing.ts';\nconsole.log(x);\n",
    );
    const packages = await measurePackages(dir, dir, ['pkg'], 100, true);
    expect(packages['pkg/text']).toBeNull();
  });
});
