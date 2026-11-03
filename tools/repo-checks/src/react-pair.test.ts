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
 *
 * The same lock check covers the other framework packages the docs twoslash
 * fences resolve (see FRAMEWORK_PACKAGES). A nested copy of any of them makes
 * `npm ls` report "deduped" while TypeScript sees two declarations and fails
 * with TS2307 or TS2717.
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
});

/**
 * Packages whose lock entry must exist once, at the top level. `npm install`
 * nested a second react-router under the workspaces on 2026-11-01 and
 * 2026-11-03. Add a name to NESTED_ALLOWED only with the reason beside it.
 */
const FRAMEWORK_PACKAGES = [
  'react',
  'react-dom',
  'react-router',
  '@react-router/dev',
  '@react-router/node',
  '@react-router/serve',
  '@types/react',
  '@types/react-dom',
  'next',
] as const;

/** Nested lock keys that are allowed, each with the reason. */
const NESTED_ALLOWED: Record<string, string> = {};

function nestedFrameworkCopies(packages: Record<string, unknown>): string[] {
  return Object.keys(packages).filter((key) => {
    const match = /^.+\/node_modules\/(.+)$/.exec(key);
    return (
      match !== null &&
      (FRAMEWORK_PACKAGES as readonly string[]).includes(match[1]) &&
      NESTED_ALLOWED[key] === undefined
    );
  });
}

function nestedMessage(nested: string[]): string {
  return [
    'package-lock.json holds nested copies of framework packages:',
    ...nested.map((key) => `  ${key}`),
    'Delete those lock entries and run `npm install --package-lock-only`.',
    'If the copy comes back, align that workspace range with the root range.',
    'A legitimate copy goes in NESTED_ALLOWED with its reason.',
  ].join('\n');
}

describe('framework packages in package-lock.json', () => {
  it('have no nested copy under a workspace or another package', () => {
    const lock = JSON.parse(
      readFileSync(join(workspaceRoot, 'package-lock.json'), 'utf-8'),
    ) as { packages: Record<string, unknown> };

    const nested = nestedFrameworkCopies(lock.packages);

    expect(nested, nested.length > 0 ? nestedMessage(nested) : '').toEqual([]);
  });

  it('flags a nested react-router in a fixture lock', () => {
    const nested = nestedFrameworkCopies({
      'node_modules/react-router': {},
      'apps/docs/node_modules/react-router': {},
      'node_modules/@types/react': {},
      'libs/react/node_modules/@types/react': {},
    });

    expect(nested).toEqual([
      'apps/docs/node_modules/react-router',
      'libs/react/node_modules/@types/react',
    ]);
    expect(nestedMessage(nested)).toContain(
      'apps/docs/node_modules/react-router',
    );
    expect(nestedMessage(nested)).toContain('npm install --package-lock-only');
  });

  it('passes a clean fixture lock', () => {
    expect(
      nestedFrameworkCopies({
        '': {},
        'node_modules/react-router': {},
        'node_modules/react': {},
        'apps/docs/node_modules/left-pad': {},
        'node_modules/foo/node_modules/react-router-dom': {},
      }),
    ).toEqual([]);
  });
});
