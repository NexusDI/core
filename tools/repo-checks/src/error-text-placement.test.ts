import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { parse } from './core-layers.js';
import { libDirs, libPackages, sourcesOf } from './entry-graph.js';
import { declaredCodes, instanceofClasses, packCodes } from './error-codes.js';
import { textPlacement, type TextPolicy } from './error-text-placement.js';

// The fixtures import errorBase from '@acme/nexusdi-core', a module nothing
// resolves. An import of '@nexusdi/core' would make the project graph read
// the fixtures as a dependency of repo-checks on core.
const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'error-text-placement',
);
const LIBS = join(workspaceRoot, 'libs');

/**
 * Where spec section 2.5.1's rule gives way, each with its reason. An entry
 * for a package absent from libs/ is ignored; an entry for a present package
 * that nothing uses fails the live test, so the list cannot go stale.
 */
const POLICY: TextPolicy = {
  // V9: codes a package reports from compile.check with inline text.
  inlineText: [
    {
      package: '@nexusdi/testing',
      codes: ['NEXUS_OVERRIDE_UNUSED', 'NEXUS_OVERRIDE_EXPORTS'],
      reason:
        'dev-only package; full text with zero wiring; translation not supported',
    },
  ],
  // Codes with no pack entry because the errors engine renders their text.
  engineRendered: [
    {
      package: '@nexusdi/core',
      code: 'NEXUS_BLUEPRINT_INVALID',
      errorClass: 'BlueprintError',
      reason:
        "the engine renders the aggregate from each inner error's pack text (spec section 2.5.3)",
    },
  ],
  // Sites the check cannot trace: report() and format() arguments, check
  // members, report and format handed on.
  opaqueSites: [],
};

const EMPTY: TextPolicy = {
  inlineText: [],
  engineRendered: [],
  opaqueSites: [],
};

/** Each fixture's pack sits in text.ts, which its `./text` export names. */
const TEXT_EXPORT = { './text': { '@nexusdi/source': './src/text.ts' } };

const fixture = (name: string) => ({
  name: '@acme/cache',
  exports: TEXT_EXPORT,
  files: sourcesOf(join(FIXTURES, name)),
});

describe('declaredCodes', () => {
  it('reads each NexusErrorByCode augmentation', () => {
    expect(declaredCodes(parse(fixture('clean').files))).toEqual([
      'ACME_CACHE_MISS',
      'ACME_STORE_FULL',
      'ACME_STORE_LOCKED',
      'ACME_CACHE_KEY',
    ]);
  });
});

describe('packCodes', () => {
  it('reads the keys of the pack in text.ts', () => {
    const { files, exports } = fixture('clean');
    expect(packCodes(parse(files), exports)).toEqual([
      'ACME_CACHE_MISS',
      'ACME_STORE_FULL',
      'ACME_STORE_LOCKED',
    ]);
  });

  it('reads the pack of every module the ./text export reaches', () => {
    const files = [
      {
        path: 'packs/index.ts',
        source: "export { cacheText } from './cache-text.js';",
      },
      {
        path: 'packs/cache-text.ts',
        source:
          'export const cacheText = { ACME_CACHE_MISS: () => ({ message: "" }) } satisfies ErrorTextPack;',
      },
    ];
    expect(
      packCodes(parse(files), {
        './text': { '@nexusdi/source': './src/packs/index.ts' },
      }),
    ).toEqual(['ACME_CACHE_MISS']);
  });

  it('reads no pack from a text.ts that no ./text export names', () => {
    expect(packCodes(parse(fixture('clean').files), {})).toEqual([]);
  });
});

describe('instanceofClasses', () => {
  it('finds each engine-rendered class tested with instanceof in @nexusdi/errors', () => {
    const engine = instanceofClasses(
      parse(sourcesOf(join(LIBS, 'errors', 'src'))),
    );
    for (const entry of POLICY.engineRendered)
      expect(engine).toContain(entry.errorClass);
  });
});

describe('textPlacement', () => {
  it('accepts pack text for reported and formatted codes and inline text elsewhere', () => {
    const result = textPlacement(fixture('clean'), EMPTY);
    expect(result.violations).toEqual([]);
    expect(result.scanned.reports).toBeGreaterThan(0);
    expect(result.scanned.formats).toBeGreaterThan(0);
  });

  it('reports a declared code with neither a pack entry nor an inline raise site', () => {
    expect(
      textPlacement(fixture('sabotaged/missing-text'), EMPTY).violations,
    ).toEqual([
      '@acme/cache declares ACME_CACHE_STALE, and it has neither a pack entry nor an inline raise site',
    ]);
  });

  it('reports a check that reports a package-local factory error with inline text', () => {
    expect(
      textPlacement(fixture('sabotaged/reported-text'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:10 reports ACME_CACHE_MISS, built with inline text at errors.ts:9; reported and formatted errors take their text from the pack',
    ]);
  });

  it('reports a plugin that formats an error built with inline text', () => {
    expect(
      textPlacement(fixture('sabotaged/formatted-text'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:15 formats ACME_CACHE_MISS, built with inline text at plugin.ts:16; reported and formatted errors take their text from the pack',
    ]);
  });

  it('fails closed on an argument it cannot trace to a raise site', () => {
    expect(
      textPlacement(fixture('sabotaged/opaque-argument'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:11 reports error, which is neither a new expression nor a call to a package-local factory that returns one; build the error there, or allowlist the site with a reason',
    ]);
  });

  it('fails closed on options it cannot read', () => {
    expect(
      textPlacement(fixture('sabotaged/options-unread'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:11 reports ACME_CACHE_MISS, built at plugin.ts:11 with options the check cannot read; pass an object literal, or allowlist the site with a reason',
    ]);
  });

  it('fails closed on a check that passes report on', () => {
    expect(
      textPlacement(fixture('sabotaged/report-passed-on'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:17 passes report on as a value, and the check cannot follow it; call report where it is bound, or allowlist the site with a reason',
    ]);
  });

  it('follows a check hook the plugin names by reference', () => {
    expect(
      textPlacement(fixture('sabotaged/hook-by-name'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:10 reports ACME_CACHE_MISS, built with inline text at errors.ts:9; reported and formatted errors take their text from the pack',
    ]);
  });

  it('ignores an array-valued check and inspects a compile object built apart', () => {
    expect(
      textPlacement(fixture('sabotaged/hook-lists'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:10 reports ACME_CACHE_MISS, built with inline text at errors.ts:9; reported and formatted errors take their text from the pack',
    ]);
  });

  it('fails closed on a check hook it cannot trace or whose report it cannot name', () => {
    expect(
      textPlacement(fixture('sabotaged/hook-untraceable'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:9 sets check to makeCheck(), which is neither a function written there nor a package-local function; write the hook as one, or allowlist the site with a reason',
      'plugin.ts:16 takes report as ...args, which the check cannot follow; name the second parameter, or allowlist the site with a reason',
    ]);
  });

  it('follows format through a destructured binding and an element access', () => {
    expect(
      textPlacement(fixture('sabotaged/format-unbound'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:21 formats ACME_CACHE_MISS, built with inline text at plugin.ts:21; reported and formatted errors take their text from the pack',
      'plugin.ts:22 formats ACME_CACHE_MISS, built with inline text at plugin.ts:22; reported and formatted errors take their text from the pack',
      'plugin.ts:15 passes format on as a value, and the check cannot follow it; call format where it is bound, or allowlist the site with a reason',
    ]);
  });

  it('ignores a format field on a value that is not a plugin context', () => {
    expect(textPlacement(fixture('format-field'), EMPTY).violations).toEqual(
      [],
    );
  });

  it('follows the plugin context into a local function and a property, and fails closed where it escapes', () => {
    expect(
      textPlacement(fixture('sabotaged/context-escapes'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:10 formats ACME_CACHE_MISS, built with inline text at plugin.ts:10; reported and formatted errors take their text from the pack',
      'plugin.ts:45 formats ACME_CACHE_MISS, built with inline text at plugin.ts:45; reported and formatted errors take their text from the pack',
      'plugin.ts:20 passes the plugin context on as a value, and the check cannot follow it to its format calls; keep it in a binding or property the check can trace, or allowlist the site with a reason',
      'plugin.ts:33 sets setup to makeSetup(), which is neither a function written there nor a package-local function; write the hook as one, or allowlist the site with a reason',
      'plugin.ts:37 takes the plugin context as ...args, which the check cannot follow; name the first parameter, or allowlist the site with a reason',
    ]);
  });

  it('follows the plugin context through a setter and assignment patterns, and fails closed where a holder escapes', () => {
    expect(
      textPlacement(fixture('sabotaged/context-holders'), EMPTY).violations,
    ).toEqual([
      'plugin.ts:7 formats ACME_CACHE_MISS, built with inline text at plugin.ts:7; reported and formatted errors take their text from the pack',
      'plugin.ts:23 formats ACME_CACHE_MISS, built with inline text at plugin.ts:23; reported and formatted errors take their text from the pack',
      'plugin.ts:27 formats ACME_CACHE_MISS, built with inline text at plugin.ts:27; reported and formatted errors take their text from the pack',
      'plugin.ts:41 formats ACME_CACHE_MISS, built with inline text at plugin.ts:41; reported and formatted errors take their text from the pack',
      'plugin.ts:19 passes the plugin context on as a value, and the check cannot follow it to its format calls; keep it in a binding or property the check can trace, or allowlist the site with a reason',
      'plugin.ts:20 passes the plugin context on as a value, and the check cannot follow it to its format calls; keep it in a binding or property the check can trace, or allowlist the site with a reason',
    ]);
  });

  it('tells a property that holds the plugin context from another of the same name', () => {
    expect(textPlacement(fixture('context-field'), EMPTY).violations).toEqual(
      [],
    );
  });

  it('lets an inline-text allowance cover its codes', () => {
    const allowance = {
      package: '@acme/cache',
      codes: ['ACME_CACHE_MISS'],
      reason: 'fixture',
    };
    const result = textPlacement(fixture('sabotaged/reported-text'), {
      ...EMPTY,
      inlineText: [allowance],
    });
    expect(result.violations).toEqual([]);
    expect(result.used).toContain(allowance);
  });

  it('lets an engine-rendered entry cover a code with no pack entry', () => {
    const entry = {
      package: '@acme/cache',
      code: 'ACME_CACHE_STALE',
      errorClass: 'CacheStaleError',
      reason: 'fixture',
    };
    const result = textPlacement(fixture('sabotaged/missing-text'), {
      ...EMPTY,
      engineRendered: [entry],
    });
    expect(result.violations).toEqual([]);
    expect(result.used).toContain(entry);
  });

  it('lets a site allowance cover an opaque argument', () => {
    const site = {
      package: '@acme/cache',
      file: 'plugin.ts',
      argument: 'error',
      reason: 'fixture',
    };
    const result = textPlacement(fixture('sabotaged/opaque-argument'), {
      ...EMPTY,
      opaqueSites: [site],
    });
    expect(result.violations).toEqual([]);
    expect(result.used).toContain(site);
  });

  it('ignores an allowance for another package', () => {
    expect(
      textPlacement(fixture('sabotaged/reported-text'), POLICY).violations,
    ).toHaveLength(1);
  });

  const packages = libPackages(LIBS);
  const live = packages.map((pkg) => textPlacement(pkg, POLICY));

  it('scans every package in libs/, with files, codes, pack entries and reports to check', () => {
    const scanned = live.map((result) => result.scanned);
    const total = (key: keyof (typeof scanned)[number]) =>
      scanned.reduce((sum, each) => sum + each[key], 0);
    expect(packages).toHaveLength(libDirs(LIBS).length);
    expect(total('files')).toBeGreaterThan(0);
    expect(total('codes')).toBeGreaterThan(0);
    expect(total('packEntries')).toBeGreaterThan(0);
    expect(total('reports')).toBeGreaterThan(0);
  });

  it.each(packages.map((pkg, index) => [pkg.name, index] as const))(
    'holds for %s',
    (_, index) => {
      expect(live[index]?.violations).toEqual([]);
    },
  );

  it('uses every policy entry for a package in libs/', () => {
    const used = new Set(live.flatMap((result) => [...result.used]));
    const present = new Set(packages.map((pkg) => pkg.name));
    const entries = [
      ...POLICY.inlineText,
      ...POLICY.engineRendered,
      ...POLICY.opaqueSites,
    ].filter((entry) => present.has(entry.package));
    expect(entries.filter((entry) => !used.has(entry))).toEqual([]);
  });

  it('finds no pack entry for an engine-rendered code', () => {
    for (const entry of POLICY.engineRendered) {
      const pkg = packages.find((p) => p.name === entry.package);
      if (pkg === undefined) continue;
      expect(packCodes(parse(pkg.files), pkg.exports)).not.toContain(
        entry.code,
      );
    }
  });
});
