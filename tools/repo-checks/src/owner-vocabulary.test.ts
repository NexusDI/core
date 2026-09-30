import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { libPackages, sourcesOf } from './entry-graph.js';
import {
  ownerVocabulary,
  type VocabularyAllowance,
} from './owner-vocabulary.js';

// The fixtures import from '@acme/core' and '@acme/nexusdi-core', modules
// nothing resolves, so the project graph reads no dependency from them.
const FIXTURES = join(import.meta.dirname, '__fixtures__', 'owner-vocabulary');
const LIBS = join(workspaceRoot, 'libs');

/**
 * Spec section 1.2's exception: one equality check on one documented public
 * code, with a default branch for every other value. Each entry names the
 * packages that may hold that one check. A package absent from libs/ is
 * ignored, so the entries for cli (PR #61) and the server adapters (the
 * integrations spec) wait here until those packages land. A package present
 * in libs/ must use its entry, so the list cannot go stale.
 */
const ALLOWLIST: readonly VocabularyAllowance[] = [
  {
    code: 'NEXUS_BLUEPRINT_INVALID',
    packages: ['@nexusdi/cli'],
    reason:
      'the check command maps a blueprint that fails validation to its own exit code; every other error takes the default',
  },
  {
    code: 'NEXUS_DISPOSED',
    packages: [
      '@nexusdi/express',
      '@nexusdi/fastify',
      '@nexusdi/hono',
      '@nexusdi/react-router',
    ],
    reason:
      'a request on a disposed container answers 503; every other NexusError answers 500 (integrations spec 3.6)',
  },
];

/** The owner package, then each package folder of one scenario. */
const fixture = (scenario: string) => {
  const dir = join(FIXTURES, scenario);
  return [
    { name: '@acme/core', files: sourcesOf(join(FIXTURES, 'owner')) },
    ...readdirSync(dir)
      .sort()
      .map((name) => ({
        name: `@acme/${name}`,
        files: sourcesOf(join(dir, name)),
      })),
  ];
};

describe('ownerVocabulary', () => {
  it('accepts a package that reads the owner vocabulary through its exports', () => {
    expect(ownerVocabulary(fixture('clean'), []).violations).toEqual([]);
  });

  it('reports a literal of a code another package declares', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/foreign-code'), []).violations,
    ).toEqual([
      '@acme/cache status.ts:2 names NEXUS_DISPOSED, a code @acme/core declares; read it through what the owner exports',
      '@acme/cache status.ts:8 names NEXUS_MISSING_PROVIDER, a code @acme/core declares; read it through what the owner exports',
      '@acme/cache status.ts:15 names NEXUS_MISSING_PROVIDER, a code @acme/core declares; read it through what the owner exports',
    ]);
  });

  it('lets an allowance cover one equality check in a package it names', () => {
    const allowance = {
      code: 'NEXUS_DISPOSED',
      packages: ['@acme/cache'],
      reason: 'fixture',
    };
    const result = ownerVocabulary(fixture('sabotaged/foreign-code'), [
      allowance,
    ]);
    expect(result.violations).toHaveLength(2);
    expect(result.used).toContain('@acme/cache NEXUS_DISPOSED');
  });

  it('ignores an allowance for another package', () => {
    const allowance = {
      code: 'NEXUS_DISPOSED',
      packages: ['@acme/store'],
      reason: 'fixture',
    };
    expect(
      ownerVocabulary(fixture('sabotaged/foreign-code'), [allowance])
        .violations,
    ).toHaveLength(3);
  });

  it('reports a second equality check and a code in a table under an allowance', () => {
    const allowance = {
      code: 'NEXUS_DISPOSED',
      packages: ['@acme/cache'],
      reason: 'fixture',
    };
    expect(
      ownerVocabulary(fixture('sabotaged/allowance-overrun'), [allowance])
        .violations,
    ).toEqual([
      '@acme/cache status.ts:7 names NEXUS_DISPOSED, a code @acme/core declares; its allowance covers one equality check, and status.ts:2 holds it',
      '@acme/cache status.ts:10 names NEXUS_DISPOSED, a code @acme/core declares; read it through what the owner exports',
    ]);
  });

  it("reports Symbol.for on another package's key, a key it cannot read and Symbol.for handed on", () => {
    expect(
      ownerVocabulary(fixture('sabotaged/foreign-brand'), []).violations,
    ).toEqual([
      "@acme/cache brand.ts:1 calls Symbol.for('nexusdi.error'), a key @acme/core defines; import the owner's export",
      '@acme/cache brand.ts:5 calls Symbol.for with a key the check cannot read; pass a string literal',
      '@acme/cache brand.ts:7 uses Symbol.for other than as a call, and the check cannot follow it; call Symbol.for where it is written',
      "@acme/cache brand.ts:11 calls Symbol.for('nexusdi.shared'), which @acme/cache and @acme/store call and none exports; one package defines the key and exports it",
      "@acme/store brand.ts:1 calls Symbol.for('nexusdi.tag'), a key @acme/cache defines; import the owner's export",
      "@acme/store brand.ts:5 calls Symbol.for('nexusdi.shared'), which @acme/cache and @acme/store call and none exports; one package defines the key and exports it",
    ]);
  });

  it('reports a prefix test on a code and a code prefix written anywhere', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/prefix-test'), []).violations,
    ).toEqual([
      '@acme/cache codes.ts:2 tests a code by its text with error.code.startsWith; test the error through what its owner exports',
      '@acme/cache codes.ts:4 tests a code by its text with /^NEXUS_/.test; test the error through what its owner exports',
      "@acme/cache codes.ts:7 tests a code by its text with error['code'].slice; test the error through what its owner exports",
      '@acme/cache codes.ts:9 tests a code by its text with value.startsWith; test the error through what its owner exports',
      "@acme/cache codes.ts:11 writes the code prefix '^NEXUS_'; test the error through what its owner exports",
      '@acme/cache codes.ts:13 writes the code prefix /^NEXUS_/; test the error through what its owner exports',
    ]);
  });

  it('lets an allowance cover one code passed to isNexusError as its second argument', () => {
    const allowance = {
      code: 'NEXUS_DISPOSED',
      packages: ['@acme/cache'],
      reason: 'fixture',
    };
    const result = ownerVocabulary(fixture('sabotaged/allowance-call'), [
      allowance,
    ]);
    expect(result.violations).toEqual([
      '@acme/cache status.ts:9 names NEXUS_DISPOSED, a code @acme/core declares; its allowance covers one equality check, and status.ts:4 holds it',
      '@acme/cache status.ts:12 names NEXUS_DISPOSED, a code @acme/core declares; read it through what the owner exports',
    ]);
    expect(result.used).toContain('@acme/cache NEXUS_DISPOSED');
  });

  it('reports a code more than one package declares', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/redeclared-code'), []).violations,
    ).toEqual([
      '@acme/core errors.ts:20 declares NEXUS_DISPOSED, which @acme/core and @acme/cache declare; one package declares each code',
      '@acme/cache errors.ts:8 declares NEXUS_DISPOSED, which @acme/core and @acme/cache declare; one package declares each code',
    ]);
  });

  const packages = libPackages(LIBS);
  const live = ownerVocabulary(packages, ALLOWLIST);

  it('scans every package in libs/, with files, codes and brands to check', () => {
    expect(packages.map((pkg) => pkg.name)).toContain('@nexusdi/core');
    expect(packages).toHaveLength(
      readdirSync(LIBS, { withFileTypes: true }).filter((entry) =>
        entry.isDirectory(),
      ).length,
    );
    expect(live.scanned.files).toBeGreaterThan(0);
    expect(live.scanned.codes).toBeGreaterThan(0);
    expect(live.scanned.brands).toBeGreaterThan(0);
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
    const unused = ALLOWLIST.flatMap((entry) =>
      entry.packages
        .filter((name) => present.has(name))
        .map((name) => `${name} ${entry.code}`),
    ).filter((key) => !live.used.has(key));
    expect(unused).toEqual([]);
  });
});
