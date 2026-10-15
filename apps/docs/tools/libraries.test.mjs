// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { libraries } from './libraries.mjs';

const pkg = (root, dir, json) => {
  mkdirSync(join(root, 'libs', dir), { recursive: true });
  writeFileSync(join(root, 'libs', dir, 'package.json'), JSON.stringify(json));
};

describe('libraries', () => {
  it('lists every package with a library entry, and no bin-only package', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexusdi-libraries-'));
    pkg(root, 'core', {
      name: '@nexusdi/core',
      exports: { '.': './dist/index.js', './package.json': './package.json' },
    });
    pkg(root, 'cli', {
      name: '@nexusdi/cli',
      bin: { nexusdi: './dist/bin.js' },
      exports: { './package.json': './package.json' },
    });
    expect(libraries(root)).toEqual([
      { name: '@nexusdi/core', root: 'libs/core', dir: 'core' },
    ]);
  });

  it('lists the workspace as it stands', () => {
    expect(
      libraries(join(import.meta.dirname, '../../..')).map((each) => each.dir),
    ).toEqual([
      'core',
      'decorators',
      'devtools',
      'errors',
      'federation',
      'interceptors',
      'node',
      'testing',
    ]);
  });
});
