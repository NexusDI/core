import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { afterEach, describe, expect, it } from 'vitest';

// scripts/ is no project, so the test loads the runner's checks by path,
// as size-report.test.ts loads size-report.mjs.
const { legProblems } = (await import(
  pathToFileURL(join(workspaceRoot, 'scripts', 'adapter-peers-check.mjs')).href
)) as {
  legProblems(
    root: string,
    specs: readonly string[],
    libs: readonly string[],
  ): string[];
};

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A throwaway workspace: package.json files at the given paths. */
function workspace(files: Record<string, object>): string {
  // The real path: macOS links tmpdir() under /private, and the check reads
  // real paths.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'adapter-peers-')));
  for (const [path, manifest] of Object.entries(files)) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, 'package.json'), JSON.stringify(manifest));
  }
  return root;
}

const adapter = {
  name: '@nexusdi/hono',
  peerDependencies: { hono: '^4.3.3' },
  devDependencies: { '@hono/node-server': '2.1.5' },
};

describe('legProblems', () => {
  it('passes one root copy inside the leg range and the peer range', () => {
    const dir = workspace({
      'libs/hono': adapter,
      'node_modules/hono': { name: 'hono', version: '4.3.3' },
    });
    expect(legProblems(dir, ['hono@4.3.3'], [join(dir, 'libs/hono')])).toEqual(
      [],
    );
  });

  it('reports a version outside the leg spec', () => {
    const dir = workspace({
      'libs/hono': adapter,
      'node_modules/hono': { name: 'hono', version: '4.13.13' },
    });
    expect(legProblems(dir, ['hono@4.3.3'], [join(dir, 'libs/hono')])).toEqual([
      'hono 4.13.13 is outside the leg spec 4.3.3',
    ]);
  });

  it("reports a version outside the adapter's peer range", () => {
    const dir = workspace({
      'libs/hono': adapter,
      'node_modules/hono': { name: 'hono', version: '4.2.0' },
    });
    expect(legProblems(dir, ['hono@^4'], [join(dir, 'libs/hono')])).toEqual([
      "hono 4.2.0 is outside @nexusdi/hono's peer range ^4.3.3",
    ]);
  });

  it('ignores a copy under a tool the adapter does not declare', () => {
    const dir = workspace({
      'libs/hono': adapter,
      'node_modules/hono': { name: 'hono', version: '4.3.3' },
      'node_modules/@nx/vite/node_modules/hono': {
        name: 'hono',
        version: '4.13.13',
      },
    });
    expect(legProblems(dir, ['hono@4.3.3'], [join(dir, 'libs/hono')])).toEqual(
      [],
    );
  });

  it('reports a second copy under the adapter or a package it declares', () => {
    const dir = workspace({
      'libs/hono': adapter,
      'node_modules/hono': { name: 'hono', version: '4.3.3' },
      'node_modules/@hono/node-server/node_modules/hono': {
        name: 'hono',
        version: '4.13.13',
      },
    });
    expect(legProblems(dir, ['hono@4.3.3'], [join(dir, 'libs/hono')])).toEqual([
      `hono: a second copy at ${join(dir, 'node_modules/@hono/node-server/node_modules/hono')} (4.13.13)`,
    ]);
  });

  it('reports a copy under a linked lib the adapter declares', () => {
    const dir = workspace({
      'libs/hono': {
        ...adapter,
        peerDependencies: {
          ...adapter.peerDependencies,
          '@nexusdi/core': '0.4.0',
        },
      },
      'libs/core': { name: '@nexusdi/core', version: '0.4.0' },
      'libs/core/node_modules/hono': { name: 'hono', version: '4.13.13' },
      'node_modules/hono': { name: 'hono', version: '4.3.3' },
    });
    mkdirSync(join(dir, 'node_modules/@nexusdi'), { recursive: true });
    symlinkSync(
      join(dir, 'libs/core'),
      join(dir, 'node_modules/@nexusdi/core'),
    );
    expect(legProblems(dir, ['hono@4.3.3'], [join(dir, 'libs/hono')])).toEqual([
      `hono: a second copy at ${join(dir, 'libs/core/node_modules/hono')} (4.13.13)`,
    ]);
  });
});
