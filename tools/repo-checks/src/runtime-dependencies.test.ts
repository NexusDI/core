import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { runtimeDependencies } from './runtime-dependencies.js';

const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'runtime-dependencies',
);

describe('runtimeDependencies', () => {
  it('accepts dependencies the source imports, by static or dynamic import or a subpath', () => {
    expect(runtimeDependencies(join(FIXTURES, 'clean')).violations).toEqual([]);
  });

  it('refuses a dependency only a test imports', () => {
    expect(runtimeDependencies(join(FIXTURES, 'sabotaged')).violations).toEqual(
      [
        'libs/a/package.json lists isbot in dependencies, and no file in libs/a/src imports it; move it to devDependencies or drop it',
      ],
    );
  });

  const live = runtimeDependencies(workspaceRoot);

  it('scans every published package in libs/', () => {
    expect(live.scanned).toBeGreaterThanOrEqual(10);
  });

  it('holds for the workspace', () => {
    expect(live.violations).toEqual([]);
  });
});
