import type { Plugin } from 'vite';
import { doctest } from 'vite-plugin-doctest';
import { describe, expect, it } from 'vitest';

import {
  type DoctestImports,
  doctestPreload,
  expectComments,
} from '@nexusdi/doc-examples';

/**
 * expectComments turns a README block's static imports into dynamic ones in
 * the test body. doctestPreload appends a top-level import of each, so vitest
 * loads the package's source graph while it collects the file, outside any
 * test's timeout.
 */

const fence = '```';
const README = '/repo/README.md';
// doctest() is typed as a PluginOption, though it always returns one plugin.
const doctestPlugin = doctest() as Plugin;

type Transform = (
  code: string,
  id: string,
) =>
  Promise<{ code: string } | string | null> | { code: string } | string | null;

async function run(plugin: Plugin, code: string, id: string): Promise<string> {
  const result = await (plugin.transform as Transform)(code, id);

  if (result === null) return code;
  return typeof result === 'string' ? result : result.code;
}

/** The three plugins in docExamples' order. */
async function transformReadme(markdown: string, id = README): Promise<string> {
  const imports: DoctestImports = new Map();
  let code = await run(expectComments(imports), markdown, id);

  code = await run(doctestPlugin, code, id);
  return run(doctestPreload(imports), code, id);
}

const readme = (...blocks: string[][]) =>
  ['# Title', '', 'Prose.', '']
    .concat(
      ...blocks.map((block) => [
        `${fence}ts @import.meta.vitest`,
        ...block,
        fence,
        '',
      ]),
    )
    .concat('## License', '', 'MIT')
    .join('\n');

describe('doctestPreload', () => {
  it('imports each rewritten specifier once at the top level', async () => {
    const markdown = readme(
      [
        "import { Nexus, Token } from '@nexusdi/core';",
        "import * as testing from '@nexusdi/testing';",
        'Nexus; Token; testing;',
      ],
      [
        "import { Nexus } from '@nexusdi/core';",
        "import '@nexusdi/decorators';",
      ],
    );

    const lines = (await transformReadme(markdown)).split('\n');

    expect(lines.at(-1)).toBe(
      'import "@nexusdi/core"; import "@nexusdi/testing"; import "@nexusdi/decorators";',
    );
  });

  it('keeps every line of the doctest module where it was', async () => {
    const markdown = readme([
      "import { Nexus } from '@nexusdi/core';",
      'Nexus;',
    ]);
    const imports: DoctestImports = new Map();
    const rewritten = await run(expectComments(imports), markdown, README);
    const withoutPreload = (await run(doctestPlugin, rewritten, README)).split(
      '\n',
    );
    const withPreload = (await transformReadme(markdown)).split('\n');

    expect(withPreload.slice(0, withoutPreload.length)).toEqual(withoutPreload);
    expect(withPreload).toHaveLength(withoutPreload.length + 1);
  });

  it('leaves a type-only import and a dynamic import the README writes alone', async () => {
    const markdown = readme([
      "import type { IShip } from '@nexusdi/core';",
      "const lazy = await import('@nexusdi/testing');",
      'lazy;',
    ]);
    const imports: DoctestImports = new Map();
    const rewritten = await run(expectComments(imports), markdown, README);
    const doctested = await run(doctestPlugin, rewritten, README);

    expect(await transformReadme(markdown)).toBe(doctested);
  });

  it('leaves an import in an unmarked block alone', async () => {
    const markdown = [
      `${fence}ts`,
      "import { Nexus } from '@nexusdi/core';",
      fence,
    ].join('\n');

    expect(await transformReadme(markdown)).not.toContain(
      'import "@nexusdi/core";',
    );
  });

  it('leaves a TypeScript module alone', async () => {
    const imports: DoctestImports = new Map([
      ['/repo/src/index.ts', new Set(['@nexusdi/core'])],
    ]);

    expect(
      await (doctestPreload(imports).transform as Transform)(
        'export {};',
        '/repo/src/index.ts',
      ),
    ).toBeNull();
  });
});
