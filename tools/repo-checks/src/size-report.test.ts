import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// A throwaway one-file fixture, not the workspace's real one, so the
// esbuild bundle stays a one-file, no-nx-build affair: cheap enough to
// exercise the swallow/throw policy without the real fixture or a build.
const { gzipOf, measure, measurePackages, measureStandalone, overBudget } =
  (await import(
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
    gzipOf(fixture: string, root: string, file: string): Promise<number>;
    measureStandalone(
      fixture: string,
      root: string,
      swallow: boolean,
    ): Promise<Record<string, number | null>>;
    overBudget(
      fixture: string,
      sizes: {
        packages: Record<string, number | null>;
        standalone: Record<string, number | null>;
      },
    ): string[];
  };

/** A fixture folder inside the workspace, so '@nexusdi/*' resolves. */
function tmpFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(workspaceRoot, 'node_modules', '.size-test-'));
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(dir, name), text);
  return dir;
}

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

  it('reports a `<dir>-<feature>.ts` fixture under `<dir>+<feature>`, minus core', async () => {
    writeFileSync(
      join(dir, 'pkg-profile.ts'),
      'console.log(1, "a feature fixture that bundles more of the package");\n',
    );
    const core = (await measure(dir, dir, 'core.ts', false)) as number;
    const feature = (await measure(
      dir,
      dir,
      'pkg-profile.ts',
      false,
    )) as number;
    const packages = await measurePackages(
      dir,
      dir,
      ['core', 'pkg'],
      core,
      false,
    );
    expect(Object.keys(packages)).toEqual(['pkg', 'pkg/text', 'pkg+profile']);
    expect(packages['pkg+profile']).toBe(feature - core);
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

describe('fixtures.json options', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps a framework external, so the figure is the adapter plus core', async () => {
    dir = tmpFixture({
      'core.ts': "import { Nexus } from '@nexusdi/core'; console.log(Nexus);",
      'hono.ts':
        "import { Hono } from 'hono'; import { Nexus } from '@nexusdi/core'; console.log(Hono, Nexus);",
      'fixtures.json': JSON.stringify({
        hono: { external: ['hono'], budget: 100, reason: 'a test' },
      }),
    });
    const core = await gzipOf(dir, workspaceRoot, 'core.ts');
    const packages = await measurePackages(
      dir,
      workspaceRoot,
      ['hono'],
      core,
      false,
    );
    expect(packages['hono']).toBeLessThan(200); // the import line, not Hono's ~7.7 KB
  });

  it('reports a standalone fixture at its full size under its own name', async () => {
    dir = tmpFixture({
      'core.ts': "import { Nexus } from '@nexusdi/core'; console.log(Nexus);",
      'hono-worker.ts':
        "import { Hono } from 'hono'; export default new Hono();",
      'fixtures.json': JSON.stringify({
        'hono-worker': {
          standalone: true,
          platform: 'neutral',
          budget: 100_000,
          reason: 'a test',
        },
      }),
    });
    const standalone = await measureStandalone(dir, workspaceRoot, false);
    expect(standalone['hono-worker']).toBeGreaterThan(5000);
  });

  it('names each figure over its budget, with the reason the budget gives', () => {
    dir = tmpFixture({
      'fixtures.json': JSON.stringify({
        hono: { external: ['hono'], budget: 1000, reason: 'the middleware' },
        'hono-worker': { standalone: true, budget: 9000, reason: 'a Worker' },
      }),
    });
    expect(
      overBudget(dir, {
        packages: { hono: 1200 },
        standalone: { 'hono-worker': 8000 },
      }),
    ).toEqual([
      '@nexusdi/hono is 1200 bytes, over its 1000-byte budget (the middleware)',
    ]);
  });
});
