import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { globSync } from 'tinyglobby';
import { describe, expect, it } from 'vitest';

/**
 * `react` and `react-dom` carry the same version spec wherever a manifest names
 * both, and the whole workspace resolves one `react-dom`.
 *
 * React compares the two versions at startup and refuses to render when they
 * differ, so a split pair is a white page with one console line behind it. The
 * split arrives through a dependency bump that moves one of the two: both are
 * separate packages on the registry and nothing upstream holds them together.
 *
 * The second assertion is the one that catches it after the fact. An exact pin
 * in a workspace that disagrees with the root range makes npm install a nested
 * copy under that workspace rather than fail, and the hoisted copy stays at the
 * version everything else sees.
 */

const PAIR = ['react', 'react-dom'] as const;

interface Manifest {
  path: string;
  specs: Partial<Record<(typeof PAIR)[number], string>>;
}

function manifests(): Manifest[] {
  const files = globSync(['package.json', '*/*/package.json'], {
    cwd: workspaceRoot,
    ignore: ['**/node_modules/**', '**/dist/**'],
    absolute: true,
  });

  return files.map((file) => {
    const json = JSON.parse(readFileSync(file, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = { ...json.dependencies, ...json.devDependencies };
    const specs: Manifest['specs'] = {};
    for (const name of PAIR) {
      if (declared[name] !== undefined) specs[name] = declared[name];
    }
    return { path: relative(workspaceRoot, file) || 'package.json', specs };
  });
}

describe('react and react-dom', () => {
  it('carry the same spec in every manifest that names both', () => {
    const split = manifests()
      .filter(
        ({ specs }) =>
          specs.react !== undefined && specs['react-dom'] !== undefined,
      )
      .filter(({ specs }) => specs.react !== specs['react-dom'])
      .map(
        ({ path, specs }) =>
          `${path}: react ${specs.react}, react-dom ${specs['react-dom']}`,
      );

    expect(split).toEqual([]);
  });

  it('resolve to one installed react-dom', () => {
    const lock = JSON.parse(
      readFileSync(join(workspaceRoot, 'package-lock.json'), 'utf-8'),
    ) as { packages: Record<string, { version?: string }> };

    const nested = Object.keys(lock.packages).filter(
      (path) =>
        path.endsWith('/node_modules/react-dom') &&
        path !== 'node_modules/react-dom',
    );

    expect(nested).toEqual([]);
  });
});
