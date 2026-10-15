import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readReference } from '@nexusdi/doc-examples/declarations';
import type { Reference } from '@nexusdi/doc-examples/declarations';
import {
  examplesFilesIn,
  packageDirOf,
  regionFileOf,
} from '@nexusdi/doc-examples/examples-file';
import {
  expandReferences,
  mdxProse,
} from '@nexusdi/doc-examples/mdx-reference-loader';
import { workspaceRoot } from '@nx/devkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let root: string;

const page = [
  '## `create`',
  '',
  '<!-- reference @nexusdi/core#create -->',
  '',
  'Prose the author writes.',
  '',
].join('\n');

type Signature = NonNullable<Reference['signature']>;

/** A stub reader, with the signature's fields answered as given. */
function readAs(signature: Partial<Signature> = {}): () => Reference {
  return () => ({
    name: 'create',
    specifier: '@nexusdi/core',
    kind: 'function',
    signature: {
      text: 'declare function create(): void;',
      merges: false,
      values: [],
      types: [],
      fromRoot: [],
      external: [],
      prelude: [],
      ...signature,
    },
    rootSpecifier: '@nexusdi/core',
    summary: 'Builds a container.',
    rest: '',
    tags: [],
    declaration: join(root, 'libs/core/dist/index.d.ts'),
    examples: ['libs/core/README.md'],
  });
}

/** The stub reader the expansion cases share. */
const reference = readAs();

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'nexusdi-reference-'));
  mkdirSync(join(root, 'apps/docs/components/api/behaviour'), {
    recursive: true,
  });
  writeFileSync(
    join(root, 'apps/docs/components/api/behaviour/core.json'),
    JSON.stringify({ package: '@nexusdi/core', files: [], states: {} }),
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('expandReferences', () => {
  it('prefixes every class it emits with the classPrefix option', () => {
    const out = expandReferences(page, root, 'api.mdx', {
      classPrefix: 'nexus',
      read: reference,
    });

    expect(out).toContain(
      '<div className="nexus-api-entry nexus-kind-function">',
    );
    expect(out).toContain('<div className="nexus-api-entry__name">');
    expect(out).toContain('<div className="nexus-api-entry__signature">');
    expect(out).toContain('nexus-api-entry__states--silent');
    expect(out).not.toMatch(/docs-api-entry|baize-kind-/);
  });

  it('writes the summary, the kind chip and the signature fence, and keeps the prose', () => {
    const out = expandReferences(page, root, 'api.mdx', {
      classPrefix: 'nexus',
      read: reference,
    });

    expect(out).toContain('Builds a container.');
    expect(out).toContain('<Chip>function</Chip>');
    expect(out).toContain(
      '```ts twoslash\ndeclare function create(): void;\n```',
    );
    expect(out).toContain('Prose the author writes.');
  });

  it('fails at load time without a classPrefix', () => {
    expect(() => expandReferences(page, root, 'api.mdx', {} as never)).toThrow(
      TypeError,
    );
    expect(() =>
      expandReferences(page, root, 'api.mdx', undefined as never),
    ).toThrow(/needs a classPrefix option such as 'nexus'/);
  });

  it('refuses a classPrefix that is no lower-case class name', () => {
    expect(() =>
      expandReferences(page, root, 'api.mdx', {
        classPrefix: 'Nexus',
        read: reference,
      }),
    ).toThrow(TypeError);
    expect(() =>
      expandReferences(page, root, 'api.mdx', {
        classPrefix: 'nexus api',
        read: reference,
      }),
    ).toThrow(TypeError);
  });
});

describe('a signature that names another package', () => {
  it('imports a type the declaration file takes from another package', () => {
    const found = readReference(workspaceRoot, '@nexusdi/devtools', 'graph');

    expect(found.signature?.external).toEqual([['@nexusdi/core', ['Nexus']]]);
    expect(
      found.signature?.types,
      '`Nexus` belongs to `@nexusdi/core`, so importing it from the ' +
        'documented specifier would name an export the package does not have.',
    ).not.toContain('Nexus');
  });

  it('imports an external type from the package the declaration took it from', () => {
    const out = expandReferences(page, root, 'api.mdx', {
      classPrefix: 'nexus',
      read: readAs({ external: [['@nexusdi/core', ['Nexus']]] }),
    });

    expect(out).toContain("import type { Nexus } from '@nexusdi/core';");
  });

  it('writes one import line per external package, with its names on it', () => {
    const out = expandReferences(page, root, 'api.mdx', {
      classPrefix: 'nexus',
      read: readAs({
        types: ['ProviderView'],
        external: [
          ['@nexusdi/core', ['BlueprintView', 'Nexus']],
          ['@nexusdi/errors', ['ErrorsOptions']],
        ],
      }),
    });
    const imports = out
      .split('\n')
      .filter((line) => line.startsWith('import type {'));

    expect(
      imports,
      'A prettier-wrapped multi-line import inside a fence fails with ' +
        '"Cannot use import statement outside a module", so each package ' +
        'gets one line and the names go on it.',
    ).toEqual([
      "import type { ProviderView } from '@nexusdi/core';",
      "import type { BlueprintView, Nexus } from '@nexusdi/core';",
      "import type { ErrorsOptions } from '@nexusdi/errors';",
    ]);
  });
});

describe('examples files', () => {
  it('lists the README, then every docs file in name order', () => {
    const dir = join(root, 'libs/core');
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# core\n');
    writeFileSync(join(dir, 'docs/scopes.md'), '');
    writeFileSync(join(dir, 'docs/errors.md'), '');
    expect(examplesFilesIn(dir)).toEqual([
      join(dir, 'README.md'),
      join(dir, 'docs/errors.md'),
      join(dir, 'docs/scopes.md'),
    ]);
  });

  it('maps a docs file back to its package directory', () => {
    expect(packageDirOf('libs/core/docs/scopes.md')).toBe('libs/core');
    expect(packageDirOf('libs/core/README.md')).toBe('libs/core');
  });

  it('finds the one file that holds a region', () => {
    const files = ['a.md', 'b.md'];
    const read = (path: string) =>
      path === 'b.md'
        ? '<!-- #region scopes -->\n```ts\nx\n```\n<!-- #endregion scopes -->\n'
        : '';
    expect(regionFileOf(files, 'scopes', read)).toBe('b.md');
  });

  it('refuses a region two files hold, naming both', () => {
    const both = () =>
      '<!-- #region scopes -->\n```ts\nx\n```\n<!-- #endregion scopes -->\n';
    expect(() => regionFileOf(['a.md', 'b.md'], 'scopes', both)).toThrow(
      /a\.md.*b\.md/s,
    );
  });

  it('refuses a region no file holds, naming every file it read', () => {
    expect(() => regionFileOf(['a.md', 'b.md'], 'gone', () => '')).toThrow(
      /gone.*a\.md.*b\.md/s,
    );
  });
});

describe('the reference loader source', () => {
  it('names no class of the libraries site', () => {
    const source = readFileSync(
      join(workspaceRoot, 'tools/doc-examples/src/mdx-reference-loader.mjs'),
      'utf8',
    );
    expect(source).not.toMatch(/docs-api-entry|baize-kind-/);
  });
});

describe('mdxProse link tags', () => {
  it('turns a link into its label or its target', () => {
    expect(mdxProse('{@link Foo}')).toBe('`Foo`');
    expect(mdxProse('{@link Foo | the foo}')).toBe('the foo');
    expect(mdxProse('{@linkcode Foo bar}')).toBe('bar');
  });

  it('reads an unclosed link on long input in linear time', () => {
    const input = '{@link ' + '\t'.repeat(50000);
    const start = performance.now();
    expect(mdxProse(input)).toBe('\\' + input);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('reads repeated unclosed link starts in linear time', () => {
    const input = '{@link ' + '{@link |'.repeat(20000);
    const start = performance.now();
    mdxProse(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
