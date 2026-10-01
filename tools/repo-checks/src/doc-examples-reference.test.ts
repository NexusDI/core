import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Reference } from '@nexusdi/doc-examples/declarations';
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

function reference(): Reference {
  return {
    name: 'create',
    specifier: '@nexusdi/core',
    kind: 'function',
    signature: {
      text: 'declare function create(): void;',
      merges: false,
      values: [],
      types: [],
      fromRoot: [],
      prelude: [],
    },
    rootSpecifier: '@nexusdi/core',
    summary: 'Builds a container.',
    rest: '',
    tags: [],
    declaration: join(root, 'libs/core/dist/index.d.ts'),
    readme: 'libs/core/README.md',
  };
}

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
