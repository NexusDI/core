import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { behavioursOf } from '@nexusdi/doc-examples/behaviours';
import { workspaceRoot } from '@nx/devkit';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadLibraries, type Library } from './docs/loaders';

/**
 * Every sentence a reference entry would carry, held against a run.
 *
 * `docs:behaviour-data` reads the behaviour data from the test sources, so a
 * reference page builds without running a test. Reading sources means a page
 * could publish a sentence no runner reaches: a case behind a modifier the
 * parser does not know, a file the package's own `include` leaves out, or a
 * chain the parser put together in the wrong order. This file holds the data
 * against the report each library's own `test` target writes.
 *
 * The report comes from the library's target and never from a run started
 * here. A test that shells back into Nx races the outer run and fails it with
 * `Recursive task invocation detected`. So `@nexusdi/repo-checks:test` depends
 * on the `test` target of every `libs/*` project, and Nx runs each library's
 * suite first and caches it on its own. `@nexusdi/core`'s `test` depends on
 * `test-browser` and `test-bench`, so an uncached run of this file waits on a
 * browser suite and the benchmarks first. A run that takes minutes is that
 * wait, and the run has not hung.
 *
 * Ported from `Evanion/libraries` `tools/repo-checks/src/doc-behaviour-run.test.ts`
 * at 92320250.
 */

/** Where `docs:behaviour-data` writes what each library's tests state. */
const DATA = join(workspaceRoot, 'apps/docs/components/api/behaviour');

/** One chain a page would render, as the data carries it. */
interface Stated {
  chain: string[];
  generated: boolean;
}

interface Behaviours {
  package: string;
  files: string[];
  states: Record<string, Stated[]>;
}

/** What one library's suite reported: each case's chain and each block's. */
interface Reported {
  cases: Set<string>;
  groups: Set<string>;
}

/** Every library's data file, with the package directory it was written for. */
function data(): { directory: string; behaviours: Behaviours }[] {
  let files: string[];
  try {
    files = readdirSync(DATA).filter((name) => name.endsWith('.json'));
  } catch {
    throw new Error(
      `${DATA} does not exist. Run \`npx nx run @nexusdi/docs:behaviour-data\`.`,
    );
  }

  return files.sort().map((name) => ({
    directory: basename(name, '.json'),
    behaviours: JSON.parse(
      readFileSync(join(DATA, name), 'utf8'),
    ) as Behaviours,
  }));
}

/** Every chain the data holds, each one named once however many keys carry it. */
function stated(behaviours: Behaviours): Stated[] {
  const found = new Map<string, Stated>();

  for (const held of Object.values(behaviours.states)) {
    for (const each of held) {
      found.set(`${each.generated}\u0000${each.chain.join('\u0000')}`, each);
    }
  }

  return [...found.values()];
}

/**
 * Where each library's run leaves its report: inside the directory the `test`
 * target declares as its output, so a cached run restores the report with
 * everything else it wrote.
 */
const REPORT = join('test-output', 'vitest', 'coverage', 'report.json');

/** What one library's suite reported, read from its Vitest json report. */
function reportedBy(directory: string): Reported {
  const path = join(workspaceRoot, 'libs', directory, REPORT);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `${path} does not exist. Run \`npx nx test @nexusdi/${directory}\`.`,
    );
  }
  return reportedFrom(JSON.parse(text) as Report);
}

/** The part of Vitest's json report this file reads. */
interface Report {
  testResults: {
    assertionResults: {
      ancestorTitles: string[];
      title: string;
      status: string;
    }[];
  }[];
}

/**
 * The chains of every case the run passed, and of every block above one.
 *
 * Only a passed case counts. A case behind `it.skipIf`, `it.runIf` or a
 * `skip` the parser cannot see is still in the report, with `skipped` or
 * `todo` as its status, and a sentence held against it would publish a
 * behaviour no run executed.
 */
function reportedFrom(report: Report): Reported {
  const cases = new Set<string>();
  const groups = new Set<string>();

  for (const file of report.testResults) {
    for (const each of file.assertionResults) {
      if (each.status !== 'passed') continue;
      cases.add([...each.ancestorTitles, each.title].join(' > '));
      for (let at = 1; at <= each.ancestorTitles.length; at += 1) {
        groups.add(each.ancestorTitles.slice(0, at).join(' > '));
      }
    }
  }

  return { cases, groups };
}

/**
 * Every sentence the data carries that no case of the run carries.
 *
 * A seeded case (`it.each`, `it.for`) has a title computed per row, so its
 * chain stops at the `describe` that holds it, and that `describe` is what the
 * run has to report. Every other chain ends at a case title the run reports.
 */
function failuresOf(behaviours: Behaviours, reported: Reported): string[] {
  const failures: string[] = [];

  for (const each of stated(behaviours)) {
    const chain = each.chain.join(' > ');
    const found = each.generated
      ? reported.groups.has(chain)
      : reported.cases.has(chain);
    if (!found) {
      failures.push(
        `${behaviours.package} would render "${chain}" on a reference ` +
          'entry, and no case of that name ran. The sentence is read from ' +
          'the test source, so either the case does not run or ' +
          'behaviours.mjs read it wrong.',
      );
    }
  }

  return failures.sort();
}

describe('failuresOf', () => {
  const reported: Reported = {
    cases: new Set(['nodeScopes > keeps two runs apart']),
    groups: new Set(['nodeScopes', 'nodeScopes > per request']),
  };

  const behaviours = (chain: string[], generated: boolean): Behaviours => ({
    package: '@nexusdi/node',
    files: [],
    states: { nodeScopes: [{ chain, generated }] },
  });

  it('passes a case and a seeded block the run reported', () => {
    expect(
      failuresOf(
        behaviours(['nodeScopes', 'keeps two runs apart'], false),
        reported,
      ),
    ).toEqual([]);
    expect(
      failuresOf(behaviours(['nodeScopes', 'per request'], true), reported),
    ).toEqual([]);
  });

  it('names a sentence no case of that name ran', () => {
    expect(
      failuresOf(
        behaviours(['nodeScopes', 'a case nobody wrote'], false),
        reported,
      ),
    ).toEqual([expect.stringContaining('"nodeScopes > a case nobody wrote"')]);
  });

  it('names a seeded block the run never reported', () => {
    expect(
      failuresOf(
        behaviours(['nodeScopes', 'a block nobody wrote'], true),
        reported,
      ),
    ).toEqual([expect.stringContaining('"nodeScopes > a block nobody wrote"')]);
  });

  it('names a sentence whose only case the run skipped', () => {
    const skipped = reportedFrom({
      testResults: [
        {
          assertionResults: [
            {
              ancestorTitles: ['nodeScopes', 'per request'],
              title: 'keeps two runs apart',
              status: 'skipped',
            },
          ],
        },
      ],
    });

    expect(
      failuresOf(
        behaviours(
          ['nodeScopes', 'per request', 'keeps two runs apart'],
          false,
        ),
        skipped,
      ),
    ).toHaveLength(1);
    expect(
      failuresOf(behaviours(['nodeScopes', 'per request'], true), skipped),
      'A block whose every case was skipped ran nothing either.',
    ).toHaveLength(1);
  });

  it('holds a seeded chain to the block and never to a case title', () => {
    // A seeded chain matched against case titles would pass only when a row
    // happened to compute the block's own name.
    expect(
      failuresOf(
        behaviours(['nodeScopes', 'keeps two runs apart'], true),
        reported,
      ),
    ).toHaveLength(1);
  });
});

describe('the sentences a reference entry would carry', () => {
  const libraries = data();

  let released: Library[];
  beforeAll(async () => {
    released = (await loadLibraries())(workspaceRoot);
  });

  it('finds a data file for every released library', () => {
    expect(libraries.map((each) => each.directory).sort()).toEqual(
      released.map((each) => each.dir).sort(),
    );
    expect(libraries.map((each) => each.behaviours.package)).toContain(
      '@nexusdi/core',
    );
  });

  it('reads no suite that runs under a target of its own', () => {
    // A `vitest.<suite>.config.ts` runs `*.<suite>.test.ts` under its own
    // target (`test-browser`, `test-trace`, `test-e2e`), so those cases never
    // reach the report this file reads.
    for (const each of released) {
      const root = join(workspaceRoot, each.root);
      const suites = readdirSync(root)
        .map((name) => /^vitest\.([\w-]+)\.config\./.exec(name)?.[1])
        .filter((suite): suite is string => suite !== undefined);
      const files = behavioursOf(root).files;
      for (const suite of suites)
        expect(
          files.filter((path) => path.includes(`.${suite}.test.`)),
        ).toEqual([]);
    }
  });

  it('records no fixture call on `test` as a case', () => {
    const chains = behavioursOf(join(workspaceRoot, 'libs/vitest')).chains.map(
      ({ chain }) => chain.join(' > '),
    );
    expect(
      chains.filter((chain) => /nexusRequest$|nexusSetup$/.test(chain)),
    ).toEqual([]);
  });

  it.each(libraries)(
    'states nothing $behaviours.package did not run',
    ({ directory, behaviours }) => {
      expect(failuresOf(behaviours, reportedBy(directory))).toEqual([]);
    },
    300_000,
  );
});
