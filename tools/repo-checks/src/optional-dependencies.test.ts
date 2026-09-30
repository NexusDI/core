import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { libPackages } from './entry-graph.js';
import {
  type DependencyAllowance,
  optionalDependencies,
} from './optional-dependencies.js';

// The fixture packages live under the '@acme/' scope, which nothing
// resolves, and name their manifests manifest.json. A '@nexusdi/devtools'
// specifier would make the project graph read the fixtures as a dependency
// of repo-checks on devtools, and a package.json would make nx read each
// fixture package as a project.
const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'optional-dependencies',
);
const LIBS = join(workspaceRoot, 'libs');

/**
 * The packages spec section 1.6 lets a package require. An entry for a
 * package absent from libs/ is ignored, so cli's entry (PR #61) waits here
 * until it lands. An entry for a present package that nothing uses fails
 * the live test, so the list cannot go stale.
 */
const ALLOWLIST: readonly DependencyAllowance[] = [
  {
    package: '@nexusdi/devtools',
    dependency: '@nexusdi/errors',
    reason:
      'the errors engine is part of devtools, which formats every error it shows (spec section 2.5.8)',
  },
  {
    package: '@nexusdi/cli',
    dependency: '@nexusdi/devtools',
    reason:
      "the cli resolves the project's @nexusdi/devtools at run time, which is the cli's job (spec section 1.6)",
  },
];

const FIXTURE_ALLOWLIST: readonly DependencyAllowance[] = [
  { package: '@acme/devtools', dependency: '@acme/errors', reason: 'fixture' },
  { package: '@acme/cli', dependency: '@acme/devtools', reason: 'fixture' },
];

const fixture = (name: string) =>
  libPackages(join(FIXTURES, name), 'manifest.json');

describe('optionalDependencies', () => {
  it('accepts type-only and subpath imports of an optional peer and the allowed requirements', () => {
    const result = optionalDependencies(
      fixture('clean'),
      FIXTURE_ALLOWLIST,
      '@acme',
    );
    expect(result.violations).toEqual([]);
    expect(result.used).toEqual(
      new Set(['@acme/cli @acme/devtools', '@acme/devtools @acme/errors']),
    );
  });

  it('reports a required package no allowance names', () => {
    expect(
      optionalDependencies(fixture('clean'), [], '@acme').violations,
    ).toEqual([
      '@acme/cli package.json requires @acme/devtools in peerDependencies; a package requires only @acme/core and names every other package as an optional peer',
      '@acme/devtools package.json requires @acme/errors in dependencies; a package requires only @acme/core and names every other package as an optional peer',
    ]);
  });

  it('reports undeclared imports, optional peers the main entry loads, run-time imports and plugin lookups', () => {
    expect(
      optionalDependencies(fixture('sabotaged'), [], '@acme').violations,
    ).toEqual([
      '@acme/broken package.json has a . export with no @nexusdi/source file, so the main entry cannot be walked',
      '@acme/cache extra.ts imports @acme/errors, which package.json names in neither dependencies nor peerDependencies',
      '@acme/cache extra.ts imports @acme/testing, which package.json names in neither dependencies nor peerDependencies',
      "@acme/cache lookup.ts:4 writes the plugin name 'nexus:errors' outside a plugin's own name; reach the plugin through what its owner exports",
      "@acme/cache lookup.ts:6 calls import('@acme/devtools'); name the package in import type or from a subpath entry the application imports",
      '@acme/cache lookup.ts:8 calls import(`@acme/${name}`); name the package in import type or from a subpath entry the application imports',
      '@acme/cache feature.ts imports @acme/devtools by value, an optional peer, and the main entry reaches it (index.ts > feature.ts); import it as a type or from a subpath entry',
      '@acme/store package.json requires @acme/errors in dependencies; a package requires only @acme/core and names every other package as an optional peer',
      '@acme/store package.json requires @acme/testing in peerDependencies; a package requires only @acme/core and names every other package as an optional peer',
    ]);
  });

  const packages = libPackages(LIBS);
  const live = optionalDependencies(packages, ALLOWLIST);

  it('scans every package in libs/, with files, imports and main entries to check', () => {
    expect(packages).toHaveLength(
      readdirSync(LIBS, { withFileTypes: true }).filter((entry) =>
        entry.isDirectory(),
      ).length,
    );
    expect(live.scanned.files).toBeGreaterThan(0);
    expect(live.scanned.imports).toBeGreaterThan(0);
    expect(live.scanned.mainEntries).toBeGreaterThan(0);
  });

  it.each(packages.map((pkg) => [pkg.name] as const))(
    'holds for %s',
    (name) => {
      expect(
        live.violations.filter((violation) => violation.startsWith(`${name} `)),
      ).toEqual([]);
    },
  );

  it('uses every allowance for a package in libs/', () => {
    const present = new Set(packages.map((pkg) => pkg.name));
    expect(
      ALLOWLIST.filter((entry) => present.has(entry.package))
        .map((entry) => `${entry.package} ${entry.dependency}`)
        .filter((key) => !live.used.has(key)),
    ).toEqual([]);
  });
});
