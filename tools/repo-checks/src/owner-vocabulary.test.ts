import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { libDirs, libPackages, sourcesOf } from './entry-graph.js';
import {
  ownerVocabulary,
  type VocabularyAllowance,
} from './owner-vocabulary.js';

// The fixtures import from '@acme/core', '@acme/shields' and
// '@acme/nexusdi-core'. Only the check's own programs resolve the first two,
// through the `exports` the fixture helper gives each package, so the project
// graph reads no dependency from them.
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

/** Each fixture package's main entry is its index.ts. */
const exports = { '.': './index.ts' };

/** The owner package, then each package folder of one scenario. */
const fixture = (scenario: string) => {
  const dir = join(FIXTURES, scenario);
  return [
    { name: '@acme/core', exports, files: sourcesOf(join(FIXTURES, 'owner')) },
    ...libDirs(dir).map((name) => ({
      name: `@acme/${name}`,
      exports,
      files: sourcesOf(join(dir, name)),
    })),
  ];
};

/** The fix each trace event violation names. */
const BRANCH =
  "compare it with === against the owner's union, or switch on it with a default";

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

  it('accepts compares, a switch with a default and typed literals on trace event types', () => {
    const result = ownerVocabulary(fixture('discriminant'), []);
    expect(result.violations).toEqual([]);
    expect(result.scanned.events).toBe(7);
  });

  it('reports a trace event type looked up in a string-keyed table, and a table that spells event types', () => {
    const TABLE = 'an event type @acme/core declares, into';
    const FILL = 'fill a table from the events at run time';
    expect(
      ownerVocabulary(fixture('sabotaged/event-table'), []).violations,
    ).toEqual([
      `@acme/profiler table.ts:3 writes 'scope:create', ${TABLE} an object literal; ${FILL}`,
      `@acme/profiler table.ts:4 looks up event.type in WEIGHT, a table keyed by string; ${BRANCH}`,
      `@acme/profiler table.ts:6 looks up event.type in WEIGHT, a table keyed by string; ${BRANCH}`,
      `@acme/profiler table.ts:8 writes 'compile', ${TABLE} an array literal; ${FILL}`,
      `@acme/profiler table.ts:8 writes 'construct', ${TABLE} an array literal; ${FILL}`,
      `@acme/profiler table.ts:9 widens event.type to string; ${BRANCH}`,
      `@acme/profiler table.ts:11 writes 'init', ${TABLE} an array literal; ${FILL}`,
      `@acme/profiler table.ts:14 writes 'compile', ${TABLE} an object literal; ${FILL}`,
      `@acme/profiler table.ts:15 writes 'run', ${TABLE} an object literal; ${FILL}`,
    ]);
  });

  it('reports a trace event type or field widened to string', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/event-widened'), []).violations,
    ).toEqual([
      `@acme/profiler widen.ts:4 widens event.type to string; ${BRANCH}`,
      `@acme/profiler widen.ts:7 widens event.type to string; ${BRANCH}`,
      `@acme/profiler widen.ts:10 widens event.phase to string; ${BRANCH}`,
      `@acme/profiler widen.ts:13 widens type to string; ${BRANCH}`,
      `@acme/profiler widen.ts:17 widens event.type to string; ${BRANCH}`,
      "@acme/profiler widen.ts:20 compares event.type with name, which the compiler does not check against the owner's union; compare it with a literal of the union",
      `@acme/profiler widen.ts:23 widens event.type to unknown; ${BRANCH}`,
      `@acme/profiler widen.ts:27 widens event.type to any; ${BRANCH}`,
      `@acme/profiler widen.ts:29 widens event.type to unknown; ${BRANCH}`,
      `@acme/profiler widen.ts:31 widens event.type to any; ${BRANCH}`,
    ]);
  });

  it('reports a trace event type or field tested with a pattern', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/event-regex'), []).violations,
    ).toEqual([
      `@acme/profiler pattern.ts:4 widens event.type to string; ${BRANCH}`,
      `@acme/profiler pattern.ts:8 widens event.phase to string; ${BRANCH}`,
    ]);
  });

  it('reports the text of a trace event type read or written into a string', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/event-text'), []).violations,
    ).toEqual([
      `@acme/profiler text.ts:4 reads the text of event.type with event.type.startsWith; ${BRANCH}`,
      `@acme/profiler text.ts:7 reads the text of event.type with event.type.split; ${BRANCH}`,
      `@acme/profiler text.ts:9 reads the text of event.type with event.type.match; ${BRANCH}`,
      `@acme/profiler text.ts:12 reads the text of event.type with event.type.includes; ${BRANCH}`,
      `@acme/profiler text.ts:14 writes event.type into a template literal; ${BRANCH}`,
      `@acme/profiler text.ts:16 joins event.type into a string with +; ${BRANCH}`,
    ]);
  });

  it('reports a trace event type read through a literal that wraps it', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/event-wrapped'), []).violations,
    ).toEqual([
      `@acme/profiler wrapped.ts:3 reads the text of event.type with [event.type].join; ${BRANCH}`,
      `@acme/profiler wrapped.ts:6 widens event.type to any; ${BRANCH}`,
      `@acme/profiler wrapped.ts:9 uses event.type as a key of an object typed {}; ${BRANCH}`,
      `@acme/profiler wrapped.ts:13 reads the text of box.t with box.t.startsWith; ${BRANCH}`,
    ]);
  });

  it("reports a read through a local alias of the owner's TraceEvent", () => {
    expect(
      ownerVocabulary(fixture('sabotaged/event-alias'), []).violations,
    ).toEqual([
      `@acme/profiler alias.ts:6 reads the text of event.type with event.type.startsWith; ${BRANCH}`,
    ]);
  });

  it('reports a switch on a trace event type or field with no default', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/event-switch-no-default'), [])
        .violations,
    ).toEqual([
      '@acme/profiler switch.ts:4 switches on event.type with no default branch; add a default for an event type or value the owner adds later (P2)',
      '@acme/profiler switch.ts:13 switches on event.phase with no default branch; add a default for an event type or value the owner adds later (P2)',
    ]);
  });

  it("reports a literal of another package's event type in a table or outside a typed compare", () => {
    const OWNER = "'@acme/shields/raise', an event type @acme/shields declares";
    const NAMES = `${OWNER}; compare a typed read with it, or pass it where the owner's union types the argument`;
    const FILL = 'fill a table from the events at run time';
    expect(
      ownerVocabulary(fixture('sabotaged/foreign-event-key'), []).violations,
    ).toEqual([
      `@acme/profiler keys.ts:4 names ${NAMES}`,
      `@acme/profiler keys.ts:7 writes ${OWNER}, into an object literal; ${FILL}`,
      `@acme/profiler keys.ts:10 writes ${OWNER}, into an array literal; ${FILL}`,
      `@acme/profiler keys.ts:12 writes ${OWNER}, into an array literal; ${FILL}`,
      `@acme/profiler keys.ts:14 names ${NAMES}`,
    ]);
  });

  it('reports an event type more than one package declares', () => {
    expect(
      ownerVocabulary(fixture('sabotaged/redeclared-event'), []).violations,
    ).toEqual([
      '@acme/core trace.ts:10 declares event type init, which @acme/core and @acme/profiler declare; one package declares each event type',
      '@acme/profiler trace.ts:5 declares event type init, which @acme/core and @acme/profiler declare; one package declares each event type',
    ]);
  });

  const packages = libPackages(LIBS);
  const live = ownerVocabulary(packages, ALLOWLIST);

  it('scans every package in libs/, with files, codes and brands to check', () => {
    expect(packages.map((pkg) => pkg.name)).toContain('@nexusdi/core');
    expect(packages).toHaveLength(libDirs(LIBS).length);
    expect(live.scanned.files).toBeGreaterThan(0);
    expect(live.scanned.codes).toBeGreaterThan(0);
    expect(live.scanned.brands).toBeGreaterThan(0);
    expect(live.scanned.events).toBeGreaterThan(0);
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
