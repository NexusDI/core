import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chainsOf } from '@nexusdi/doc-examples/behaviours';
import type { Reference } from '@nexusdi/doc-examples/declarations';
import {
  expandReferences,
  statedBy,
} from '@nexusdi/doc-examples/mdx-reference-loader';
import type { StatedFile } from '@nexusdi/doc-examples/mdx-reference-loader';
import { workspaceRoot } from '@nx/devkit';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadReferenceOptions, type ReferenceOptions } from './docs/loaders';

/**
 * The two halves of the behaviour catalogue, read apart.
 *
 * `chainsOf` decides which sentence a case contributes. A source written here
 * drives it, because the thing under test is what a runner does with
 * `describe.each` and a skipped case, and a real suite carries one shape of
 * each at best.
 *
 * `expandReferences` decides what the entry says. `@nexusdi/testing`'s own
 * data drives it, because the sentence a reader sees is the sentence the
 * package's tests carry, and a hand-written fixture would prove only that the
 * renderer agrees with the fixture.
 */

const TESTING = '@nexusdi/testing';

/** The stub `readReference` the rendering half is driven with. */
function read(_root: string, specifier: string, name: string): Reference {
  return {
    name,
    specifier,
    kind: 'function',
    signature: {
      text: `function ${name}(value: string): number;`,
      merges: false,
      values: [name],
      types: [],
      fromRoot: [],
      external: [],
      prelude: [],
    },
    rootSpecifier: specifier,
    summary: 'Builds a testing container.',
    rest: '',
    tags: [],
    declaration: '/nowhere/index.d.ts',
    examples: ['libs/testing/README.md'],
  };
}

const page = 'apps/docs/content/api-testing.mdx';

/** One rail row in the props the loader emits: its sentence and its case. */
const ROW = /\{"title":("(?:[^"\\]|\\.)*"),"id":(\d+)\}/g;

/** One export's cases, as `docs:behaviour-data` writes them beside the page. */
interface Sidecar {
  package: string;
  name: string;
  bodies: Record<string, { where: string; line: number; html: string }>;
  popups: Record<string, string>;
}

/** The prefixes `apps/docs/tools/reference-options.mjs` gives the build. */
let prefixes: ReferenceOptions;
beforeAll(async () => {
  prefixes = await loadReferenceOptions();
});

const expand = (name: string): string =>
  expandReferences(
    `## \`${name}\`\n\n<!-- reference ${TESTING}#${name} -->\n`,
    workspaceRoot,
    page,
    { ...prefixes, read },
  );

/** A test source, written where the parser can read it as a file. */
function write(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'behaviours-')), 'a.test.ts');
  writeFileSync(path, contents);
  return path;
}

describe('chainsOf', () => {
  it('carries every `describe` above a case, outermost first', () => {
    const found = chainsOf(
      write(
        `describe('widen', () => {
           describe('a narrowing', () => {
             it('refuses a key the document never held', () => {});
           });
         });`,
      ),
    );

    expect(found).toMatchObject([
      {
        chain: [
          'widen',
          'a narrowing',
          'refuses a key the document never held',
        ],
        generated: false,
      },
    ]);
  });

  it('carries the case body, with the nesting taken off the front', () => {
    const [found] = chainsOf(
      write(
        `describe('widen', () => {
           describe('a narrowing', () => {
             it('refuses a key the document never held', () => {
               const out = widen(matrix, {});
               expect(out).toBe(null);
             });
           });
         });`,
      ),
    );

    expect(
      found?.body,
      'The pane shows the assertions the author wrote and never a reading of ' +
        'them, and it shows them at column zero however deep the case sits.',
    ).toBe('const out = widen(matrix, {});\nexpect(out).toBe(null);');
    expect(found?.line).toBe(3);
  });

  it('maps every character of a body back to where it stood in the file', () => {
    const source = [
      "describe('widen', () => {",
      "  it('keeps the key', () => {",
      '    const kept = widen(listing);',
      '    expect(kept).toBe(listing);',
      '  });',
      '});',
    ].join('\n');
    const [found] = chainsOf(write(source));

    expect(found.offsets).toHaveLength(found.body.length);
    for (const [at, offset] of found.offsets.entries()) {
      expect(source[offset]).toBe(found.body[at]);
    }
  });

  it('collapses a seeded case into the block that names what it is about', () => {
    const found = chainsOf(
      write(
        `describe('widen', () => {
           describe('an overlay that matches nothing changes no decision', () => {
             it.each([1, 2])('seed %i', () => {});
           });
         });`,
      ),
    );

    expect(found).toMatchObject([
      {
        chain: ['widen', 'an overlay that matches nothing changes no decision'],
        generated: true,
      },
    ]);
    expect(
      found[0]?.body,
      'A seeded case has no sentence of its own, so what it asserts is the ' +
        'whole call, seeds included.',
    ).toContain('it.each([1, 2])');
  });

  it('drops a block whose own title is written per row', () => {
    const found = chainsOf(
      write(
        `describe.each(['a', 'b'])('over the %s instance', () => {
           it('reaches every index', () => {});
         });`,
      ),
    );

    expect(
      found,
      'The runner reports `over the a instance`, so the title in the source ' +
        'is a format string no case ever ran under.',
    ).toEqual([]);
  });

  it('drops a case the runner never reaches', () => {
    const found = chainsOf(
      write(
        `describe('widen', () => {
           it.skip('refuses a key the document never held', () => {});
           it.todo('names the key');
         });`,
      ),
    );

    expect(found).toEqual([]);
  });
});

describe('the block an entry carries', () => {
  it('states the sentences under the export, with its own name dropped', () => {
    const out = expand('createTestingContainer');

    expect(out).toContain('What the tests state');
    expect(
      out,
      'The reader is on `createTestingContainer`, so the segment naming it ' +
        'is the one thing on the line they already have.',
    ).toContain('"replaces every provider of a plain token, in every module"');
  });

  it('gives a condition the suite wrote its own group in the rail', () => {
    const out = expand('createTestingContainer');

    expect(out).toContain('{"label":"load() under overrideModule"');
    expect(out).toContain('{"label":"a malformed override"');
    expect(
      out,
      'The condition names itself once, as the label over the sentences that ' +
        'hold under it, and stays off the front of each of them.',
    ).toContain(
      '"does not reject NEXUS_LOAD_GLOBAL_MODULE for a global import the override already removed"',
    );
  });

  it('labels the sentences under the export itself with the export name', () => {
    expect(
      expand('OverrideError'),
      "They sit under the export's own `describe` and nothing else, so an " +
        'unlabelled run of them beside the labelled groups would read as ' +
        'belonging to nowhere.',
    ).toContain('{"label":"OverrideError"');
  });

  it('gives every sentence the number its case is keyed by', () => {
    const rows = [...expand('createTestingContainer').matchAll(ROW)];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(Number.isInteger(Number(row[2]))).toBe(true);
  });

  it('says so where a callable export has nothing stated', () => {
    expect(expand('noSuchExport')).toContain(
      'No test in this package states a behaviour under this name.',
    );
  });

  it('puts the sentences between the signature and the example', () => {
    const out = expand('createTestingContainer');

    expect(out.indexOf('nexus-api-entry__states')).toBeGreaterThan(
      out.indexOf('nexus-api-entry__signature'),
    );
  });

  it('counts the sentences it shows and nothing beyond them', () => {
    const out = expand('createTestingContainer');
    const shown = [...out.matchAll(ROW)].length;
    const counted =
      /<span className="nexus-api-entry__states-count-value">(\d+)<\/span> behaviours?/.exec(
        out,
      );

    expect(counted?.[1]).toBe(String(shown));
    expect(
      out,
      'The entry counts the sentences it carries and never how many cases ' +
        'the suite ran.',
    ).not.toMatch(/\d+ (cases|tests)/);
  });

  it('carries no status beside a sentence', () => {
    expect(
      expand('createTestingContainer'),
      'Every sentence here comes from a suite that passes, so a tick states ' +
        'nothing, and a green one states that the page verified something.',
    ).not.toMatch(/passed|\u2713|\u2717/);
  });

  it('names the library whose sidecar carries the cases', () => {
    expect(expand('createTestingContainer')).toContain(
      '<BehaviourCatalogue library="testing"',
    );
  });
});

/**
 * The cases behind the sentences, held against the sentences.
 *
 * One run of `docs:behaviour-data` writes both files, and two different
 * readers take them: the loader reads the index during `next build` and the
 * catalogue fetches the sidecar in a browser. A sentence whose number the
 * sidecar has no body for renders a rail row that opens onto nothing, and
 * nothing else in the build would say so.
 */
describe('the cases a catalogue opens', () => {
  const index = join(workspaceRoot, 'apps/docs/components/api/behaviour');
  const sidecars = join(workspaceRoot, 'apps/docs/public/behaviour');

  const libraryFiles = (): string[] => {
    try {
      return readdirSync(index).filter((name) => name.endsWith('.json'));
    } catch {
      throw new Error(
        `${index} does not exist. Run \`npx nx run @nexusdi/docs:behaviour-data\`.`,
      );
    }
  };

  const readJson = <T>(path: string): T =>
    JSON.parse(readFileSync(path, 'utf8')) as T;

  /** Every sidecar of one library, keyed by the export it belongs to. */
  const sidecarsOf = (file: string): Map<string, Sidecar> => {
    const library = file.replace(/\.json$/, '');
    return new Map(
      readdirSync(join(sidecars, library)).map((name) => [
        name.replace(/\.json$/, ''),
        readJson<Sidecar>(join(sidecars, library, name)),
      ]),
    );
  };

  /** The names an entry can carry that the rail lists a case under. */
  const namesWithCases = (stated: StatedFile): string[] =>
    Object.keys(stated.states).filter(
      (name) =>
        /^[A-Za-z_$][\w$]*$/.test(name) && statedBy(stated, name).stated > 0,
    );

  it('writes a directory of sidecars for every library that states something', () => {
    expect(libraryFiles().length).toBeGreaterThan(0);
    expect(readdirSync(sidecars).sort()).toEqual(
      libraryFiles()
        .map((name) => name.replace(/\.json$/, ''))
        .sort(),
    );
  });

  it.each(libraryFiles())(
    'writes one sidecar per export of %s whose rail lists a case',
    (file) => {
      const stated = readJson<StatedFile>(join(index, file));

      expect([...sidecarsOf(file).keys()].sort()).toEqual(
        namesWithCases(stated).sort(),
      );
    },
  );

  it.each(libraryFiles())(
    "carries every case an entry's rail opens in %s",
    (file) => {
      const stated = readJson<StatedFile>(join(index, file));
      const held = sidecarsOf(file);
      const missing: string[] = [];

      for (const name of namesWithCases(stated)) {
        const sidecar = held.get(name);
        for (const group of statedBy(stated, name).groups)
          for (const row of group.rows)
            if (!sidecar || !(String(row.id) in sidecar.bodies))
              missing.push(`${name}#${row.id}`);
      }

      expect(missing).toEqual([]);
    },
  );

  it.each(libraryFiles())('highlights every case of %s', (file) => {
    for (const sidecar of sidecarsOf(file).values()) {
      const bodies = Object.values(sidecar.bodies);

      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(body.where).toMatch(/^libs\//);
        expect(body.line).toBeGreaterThan(0);
        expect(body.html.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(libraryFiles())(
    'carries every popup a token of %s points at, and no other',
    (file) => {
      for (const sidecar of sidecarsOf(file).values()) {
        const pointed = new Set(
          Object.values(sidecar.bodies).flatMap(({ html }) =>
            [...html.matchAll(/data-pop="(\d+)"/g)].map(([, at]) => at),
          ),
        );

        expect(Object.keys(sidecar.popups).sort()).toEqual([...pointed].sort());
      }
    },
  );

  it('colours every token through a class that sets the shiki theme variables', () => {
    const stylesheet = readFileSync(join(index, 'code-classes.css'), 'utf8');
    const defined = new Set(
      [...stylesheet.matchAll(/\.(sh-\w+)\{/g)].map(([, name]) => name),
    );

    // Nextra's page fences carry the same two variables, so the cases and
    // the page switch theme with one rule in `behaviour.css`.
    for (const rule of stylesheet.matchAll(/\.sh-\w+\{([^}]*)\}/g)) {
      expect(rule[1]).toMatch(
        /^--shiki-light:#[0-9a-f]+;--shiki-dark:#[0-9a-f]+(;|$)/i,
      );
    }

    for (const file of libraryFiles()) {
      for (const sidecar of sidecarsOf(file).values()) {
        const html =
          Object.values(sidecar.bodies)
            .map((body) => body.html)
            .join('') + Object.values(sidecar.popups).join('');

        // A style the stylesheet does not hold stays inline, and the github
        // themes give only a font style or weight that treatment.
        for (const [style] of html.matchAll(/style="[^"]*"/g))
          expect(style).toMatch(/font-style|font-weight/);
        const used = [...html.matchAll(/class="[^"]*\b(sh-\w+)/g)].map(
          ([, name]) => name,
        );
        expect(used.length).toBeGreaterThan(0);
        expect(used.filter((name) => !defined.has(name))).toEqual([]);
      }
    }
  });
});
