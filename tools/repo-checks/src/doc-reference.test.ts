import {
  DeclarationError,
  readReference,
  type ExportKind,
  type Reference,
} from '@nexusdi/doc-examples/declarations';
import { expandReferences } from '@nexusdi/doc-examples/mdx-reference-loader';
import { workspaceRoot } from '@nx/devkit';
import { createTwoslasher } from 'twoslash';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadReferenceOptions, type ReferenceOptions } from './docs/loaders';
import { CONTENT } from './docs/paths';
import { readSite } from './docs/site';

/**
 * The reference loader, over the packages the reference pages are built on.
 *
 * Two halves, tested apart. `readReference` asks the compiler what an export
 * is, and it is checked against `@nexusdi/devtools` and `@nexusdi/core`,
 * because a fixture package whose declarations somebody wrote by hand would
 * prove only that the reader agrees with the fixture. `expandReferences` turns
 * that answer into markdown, and it is checked against a stub, because what
 * the markdown says is a separate question from where the facts came from.
 * `doc-examples-reference.test.ts` holds the class prefixes and the external
 * imports; this file holds the rest.
 *
 * The reader resolves through each package's `dist/`, so this runs after the
 * libraries build, which the repo-checks `test` target orders first.
 *
 * Ported from `Evanion/libraries` `tools/repo-checks/src/doc-reference.test.ts`
 * at 92320250.
 */

const DEVTOOLS = '@nexusdi/devtools';
const CORE = '@nexusdi/core';

function read(_root: string, specifier: string, name: string): Reference {
  return {
    name,
    specifier,
    kind: 'function',
    signature: {
      text: 'function widen(value: string): number;',
      merges: true,
      values: ['widen'],
      types: ['Widened'],
      fromRoot: [],
      external: [],
      prelude: [],
    },
    rootSpecifier: specifier,
    summary: 'Widens a value.',
    rest: 'The second paragraph.',
    tags: [{ name: 'param', text: 'value the thing to widen' }],
    declaration: '/nowhere/index.d.ts',
    examples: ['libs/node/README.md', 'libs/node/docs/examples.md'],
  };
}

/** Every fence's info string in an expanded entry, in the order they appear. */
function fenceInfos(out: string): string[] {
  return out
    .split('\n')
    .filter((line) => line.startsWith('```'))
    .map((line) => line.slice(3))
    .filter(Boolean);
}

let prefixes: ReferenceOptions;
beforeAll(async () => {
  prefixes = await loadReferenceOptions();
});

describe('reading an export off its declarations', () => {
  it('reads a function as a function, with its summary', () => {
    const found = readReference(workspaceRoot, DEVTOOLS, 'graph');

    expect(found.kind).toBe('function');
    expect(found.summary).toBe(
      'The compiled graph of a container registered with devtools(), as plain JSON.',
    );
  });

  it('splits a docblock into its summary and the rest', () => {
    const found = readReference(workspaceRoot, CORE, 'Token');

    expect(found.summary).not.toBe('');
    expect(
      found.rest,
      'The rest of the docblock is what the disclosure holds, and an entry ' +
        'that dropped it would cut off the prose the export carries.',
    ).toContain('The description appears in errors');
  });

  it('gives a type alias its members and never just its own name', () => {
    const found = readReference(workspaceRoot, DEVTOOLS, 'TraceEvent');

    expect(found.kind).toBe('typeAlias');
    expect(
      found.signature?.text,
      'A Twoslash `^?` over an alias returns the resolved union and over an ' +
        'interface returns the name. Printing the declaration answers both.',
    ).toContain('TraceEventByType');
  });

  it('gives an interface its fields', () => {
    const found = readReference(workspaceRoot, DEVTOOLS, 'NexusGraph');

    expect(found.kind).toBe('interface');
    expect(found.signature?.text).toMatch(/\w+[?]?: /);
  });

  it('gives a class its constructor', () => {
    const found = readReference(workspaceRoot, CORE, 'Token');

    expect(found.kind).toBe('class');
    expect(
      found.signature?.text,
      'A reader asking what to pass `new Token(...)` gets the constructor, ' +
        'which is the question a property table cannot answer.',
    ).toContain('constructor(');
  });

  it('reads an error class as an error', () => {
    expect(readReference(workspaceRoot, DEVTOOLS, 'DevtoolsError').kind).toBe(
      'error',
    );
  });

  it('imports the names its declaration mentions', () => {
    const found = readReference(workspaceRoot, DEVTOOLS, 'graph');

    expect([
      ...(found.signature?.values ?? []),
      ...(found.signature?.types ?? []),
    ]).toContain('NexusGraph');
  });

  it('refuses a name the package does not export', () => {
    expect(() =>
      readReference(workspaceRoot, DEVTOOLS, 'noSuchExport'),
    ).toThrow(DeclarationError);
  });

  it('refuses a package nothing installed', () => {
    expect(() => readReference(workspaceRoot, '@nexusdi/nope', 'x')).toThrow(
      DeclarationError,
    );
  });
});

describe('expanding a reference directive', () => {
  const page = 'apps/docs/content/api-node.mdx';
  const expand = (source: string, reader = read) =>
    expandReferences(source, workspaceRoot, page, {
      ...prefixes,
      read: reader,
    });
  const ENTRY = '## `widen`\n\n<!-- reference @nexusdi/node#widen -->\n';

  it('puts the first paragraph in the open and the rest behind a disclosure', () => {
    const out = expand(ENTRY);

    expect(out).toContain('Widens a value.');
    expect(out).toContain('<details className="nexus-api-entry__more">');
    expect(out).toContain('The second paragraph.');
  });

  it('renders a block tag as prose, where the search index can reach it', () => {
    expect(
      expand(ENTRY),
      'Every `<pre>` on this site carries `data-pagefind-ignore`, so a ' +
        'parameter named only inside the signature is a name no search finds.',
    ).toContain('`value` the thing to widen');
  });

  it('carries only the meta Nextra injects its Popup component for', () => {
    expect(
      fenceInfos(expand(ENTRY)),
      'Nextra matches the meta string exactly, and a fence carrying anything ' +
        'else blocks the import and throws on a `Popup` the page never got.',
    ).toEqual(['ts twoslash']);
  });

  it('gives an example fence the language its region was written in', () => {
    expect(
      fenceInfos(
        expand(
          '## `widen`\n\n<!-- reference @nexusdi/node#widen example=node -->\n',
        ),
      ),
      'The signature fence is always `ts`. The example fence is the ' +
        "region's own language.",
    ).toEqual(['ts twoslash', 'ts twoslash']);
  });

  it('refuses a directive with no heading above it', () => {
    expect(() =>
      expand('Some prose.\n\n<!-- reference @nexusdi/node#widen -->\n'),
    ).toThrow(/has no heading above it/);
  });

  it('refuses a named region no examples file carries', () => {
    expect(() =>
      expand(
        '## `widen`\n\n<!-- reference @nexusdi/node#widen example=no-such-region -->\n',
      ),
    ).toThrow(/no-such-region/);
  });

  it('leaves a directive inside a fence alone', () => {
    const source = [
      '```md',
      '<!-- reference @nexusdi/node#widen -->',
      '```',
      '',
    ].join('\n');

    expect(expand(source)).toBe(source);
  });

  it('leaves a page with no directive byte for byte alone', () => {
    const source = '# Title\n\nProse.\n\n## `widen`\n\nMore prose.\n';

    expect(expand(source)).toBe(source);
  });
});

/**
 * Every entry's signature fence answers for the package, and never for itself.
 *
 * This is the guard for a defect that looks correct in a browser. A fence
 * carrying `export declare function graph(...)` re-declares the symbol, and
 * Twoslash answers about what the fence declares, so hovering the name gives a
 * type and no prose while every hover still renders and every fence still
 * compiles. The docblock lives in the source that was printed from, and a
 * printed copy leaves it behind.
 *
 * The count is the test. A documented hover on the entry's own name means the
 * identifier resolved to the published symbol; zero means the fence shadowed
 * it. Measured off the compiler and not off the built HTML, because the same
 * nodes drive both and `next build` is slow and runs late.
 */
describe('a reference entry hovers the package', () => {
  const DIRECTIVE = /<!--\s*reference\s+(\S+)#(\w+)/g;
  const twoslasher = createTwoslasher();

  /**
   * The kinds TypeScript merges. A class, a `const` and a type alias cannot be
   * declared twice, so their fences print the declaration and their own name's
   * hover carries no prose; the entry renders that prose above the fence
   * either way.
   */
  const MERGING = new Set<ExportKind>(['function', 'interface']);

  const referenced = readSite(CONTENT).flatMap((page) =>
    [...page.source.matchAll(DIRECTIVE)].map((match) => ({
      page: page.file,
      specifier: match[1] as string,
      name: match[2] as string,
    })),
  );

  it('finds the entries', () => {
    expect(referenced.length).toBeGreaterThan(0);
  });

  /**
   * The build fails on a name the package does not export, since the loader
   * throws, but the build is slow and runs late. This is the same rule in
   * `nx test`, keyed on the directive.
   */
  it('names an export the package really has', () => {
    const missing = referenced.flatMap((entry) => {
      try {
        readReference(workspaceRoot, entry.specifier, entry.name);
        return [];
      } catch (error) {
        return [`${entry.page}: ${(error as Error).message}`];
      }
    });

    expect(missing).toEqual([]);
  });

  it('gives every entry a docblock summary to open with', () => {
    const bare = referenced.flatMap((entry) => {
      const found = readReference(workspaceRoot, entry.specifier, entry.name);
      return found.summary === ''
        ? [
            `${entry.page}: ${entry.specifier}#${entry.name} has no docblock summary; write one above its declaration in libs/`,
          ]
        : [];
    });

    expect(bare).toEqual([]);
  });

  it('documents the name every merging entry is about', () => {
    const undocumented = referenced.flatMap((entry) => {
      // Keyed on the kind and not on what the emission claims about itself,
      // so an emission that stops merging fails here and never opts out.
      const found = readReference(workspaceRoot, entry.specifier, entry.name);
      if (!MERGING.has(found.kind)) return [];

      const out = expandReferences(
        `## \`${entry.name}\`\n\n<!-- reference ${entry.specifier}#${entry.name} -->\n`,
        workspaceRoot,
        entry.page,
        prefixes,
      );
      const lines = out.split('\n');
      const code = lines
        .slice(lines.indexOf('```ts twoslash') + 1)
        .join('\n')
        .split('```')[0] as string;

      const documented = twoslasher(code, 'ts')
        .nodes.filter((node) => node.type === 'hover')
        .filter((node) => node.target === entry.name && node.docs);

      return documented.length > 0
        ? []
        : [`${entry.page}: ${entry.name} hovers its own name with no prose`];
    });

    expect(
      undocumented,
      'A signature fence that re-declares the export answers about itself, ' +
        'and a re-declared symbol has no docblock. Declaring it inside ' +
        "`declare module '<specifier>'` merges with the published symbol " +
        'instead, so the hover answers for the package.',
    ).toEqual([]);
  });

  it('keeps a merging kind merging', () => {
    const byKind = new Map<ExportKind, Reference>();
    for (const entry of referenced) {
      const found = readReference(workspaceRoot, entry.specifier, entry.name);
      if (!byKind.has(found.kind)) byKind.set(found.kind, found);
    }

    for (const [kind, found] of byKind) {
      expect(
        found.signature?.merges,
        `${kind} should ${MERGING.has(kind) ? '' : 'not '}merge. A kind that ` +
          'stops merging loses its docblock on hover and nothing else changes.',
      ).toBe(MERGING.has(kind));
    }
  });
});
