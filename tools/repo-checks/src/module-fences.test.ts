import { join } from 'node:path';

import type { Plugin } from 'vite';
import { doctest } from 'vite-plugin-doctest';
import { beforeAll, describe, expect, it } from 'vitest';
import { startVitest } from 'vitest/node';

import {
  type DoctestImports,
  doctestPreload,
  expectComments,
  markModuleFences,
  ModuleFenceError,
  moduleFences,
} from '@nexusdi/doc-examples';

/**
 * A fence marked `ts @import.meta.vitest @module` runs at module level, so it
 * can declare test() calls of its own. vite-plugin-doctest wraps every other
 * doctest in a test(), inside which Vitest refuses a nested test().
 */

const fence = '```';
const README = '/repo/README.md';
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

/** docExamples' plugins, in its order. */
async function transformReadme(markdown: string): Promise<string> {
  const imports: DoctestImports = new Map();
  let code = await run(expectComments(imports), markdown, README);
  code = await run(doctestPlugin, code, README);
  code = await run(moduleFences(), code, README);
  return run(doctestPreload(imports), code, README);
}

const readme = (body: string[], info = 'ts @import.meta.vitest @module') =>
  [
    '# Title',
    '',
    'Prose.',
    '',
    `${fence}${info}`,
    ...body,
    fence,
    '',
    'End.',
  ].join('\n');

describe('markModuleFences', () => {
  it('renames the marker so doctest skips the fence, and keeps every line', async () => {
    const markdown = readme([
      "test('plots', () => {",
      '  1 + 1; // -> 2',
      '});',
    ]);
    const marked = await markModuleFences(markdown, README);
    expect(marked.split('\n')).toHaveLength(markdown.split('\n').length);
    expect(marked).toContain(`${fence}ts @module`);
    expect(marked).not.toContain('@import.meta.vitest');
  });

  it('names the README line of a parameter property, which the type strip cannot keep', async () => {
    const markdown = readme([
      'interface X {}',
      'class Holder {',
      '  constructor(private readonly x: X) {}',
      '}',
      "test('holds', () => {",
      '  new Holder({}); // -> {}',
      '});',
    ]);
    // The fence opens on line 5, so its third line is README line 8.
    await expect(markModuleFences(markdown, README)).rejects.toThrow(
      'README.md:8:',
    );
  });

  it('refuses a fence with no test() call', async () => {
    await expect(markModuleFences(readme(['1 + 1;']), README)).rejects.toThrow(
      ModuleFenceError,
    );
  });

  it('refuses a claim outside a test callback', async () => {
    const markdown = readme(['1 + 1; // -> 2', "test('plots', () => {});"]);
    await expect(markModuleFences(markdown, README)).rejects.toThrow(
      /README\.md:6: .*inside a test callback/,
    );
  });

  it('accepts a claim in a test inside a describe callback', async () => {
    const markdown = readme([
      "describe('suite', () => {",
      "  test.fails('plots', () => {",
      '    1 + 1; // -> 3',
      '  });',
      '});',
    ]);
    await expect(markModuleFences(markdown, README)).resolves.toBeTypeOf(
      'string',
    );
  });

  it('leaves a markdown file with no module fence unchanged', async () => {
    const markdown = readme(['1 + 1; // -> 2'], 'ts @import.meta.vitest');
    expect(await markModuleFences(markdown, README)).toBe(markdown);
  });
});

describe('moduleFences', () => {
  it('runs the fence at module level, in a block of its own', async () => {
    const markdown = readme([
      "import { Token } from '@nexusdi/core';",
      'const heading: number = 1 + 1;',
      "test('plots', () => {",
      '  heading; // -> 2',
      '});',
    ]);
    const code = await transformReadme(markdown);
    const lines = code.split('\n');
    const open = lines.indexOf('{');
    expect(open).toBeGreaterThan(
      lines.findIndex((line) => line.includes('= import.meta.vitest;')),
    );
    const block = lines.slice(open, lines.indexOf('}', open) + 1).join('\n');
    expect(block).toMatch(/await import\(['"]@nexusdi\/core['"]\)/);
    expect(block).toMatch(/const heading {9}= 1 \+ 1;/);
    expect(block).toContain("expect(heading, 'README.md:9').toEqual(2);");
    expect(code).not.toContain('import.meta.vitest.test(');
  });

  describe('in a nested Vitest run', () => {
    const root = join(import.meta.dirname, '__fixtures__', 'module-fences');
    let results: Record<string, { state?: string; stack: string }>;

    beforeAll(async () => {
      const vitest = await startVitest('test', [], {
        root,
        config: join(root, 'vite.config.ts'),
        watch: false,
        reporters: [],
      });
      try {
        results = Object.fromEntries(
          vitest.state.getFiles().flatMap((file) =>
            file.tasks.map((task) => [
              `${file.name} > ${task.name.replace(root + '/', '')}`,
              {
                state: task.result?.state,
                stack: task.result?.errors?.[0]?.stack ?? '',
              },
            ]),
          ),
        );
      } finally {
        await vitest.close();
      }
    }, 60_000);

    it('fails the markdown test file when a module fence test fails', () => {
      expect(
        Object.fromEntries(
          Object.entries(results).map(([name, { state }]) => [name, state]),
        ),
      ).toEqual({
        'failing.md > claims the wrong heading': 'fail',
        'mixed.md > fails in the module fence': 'fail',
        'mixed.md > mixed.md#0': 'fail',
        'passing.md > claims the right heading': 'pass',
        'prose-only.md > prose-only.md#0': 'fail',
      });
    });

    it('names the README line of each failing claim in its message', () => {
      expect(results['failing.md > claims the wrong heading']?.stack).toContain(
        'failing.md:9: expected 6 to deeply equal 7',
      );
      expect(results['mixed.md > mixed.md#0']?.stack).toContain(
        'mixed.md:13: expected 6 to deeply equal 7',
      );
    });

    it('reports the README line of a failing claim in a module fence', () => {
      expect(results['failing.md > claims the wrong heading']?.stack).toContain(
        'failing.md:9',
      );
    });

    it('reports the right line for a module fence and a doctest fence after it', () => {
      expect(results['mixed.md > fails in the module fence']?.stack).toContain(
        'mixed.md:7',
      );
      // vite-plugin-doctest maps every failure in its own fence to the
      // fence's first code line, with or without a module fence before it.
      // prose-only.md holds the same fence on the same lines with no module
      // fence, so the two must report the same line.
      // The stack's frames, past the message, which names the claim's line.
      const line = (stack: string | undefined, file: string) =>
        new RegExp(`${file}:(\\d+)`).exec(
          (stack ?? '').split('\n').slice(1).join('\n'),
        )?.[1];
      expect(line(results['mixed.md > mixed.md#0']?.stack, 'mixed.md')).toBe(
        line(
          results['prose-only.md > prose-only.md#0']?.stack,
          'prose-only.md',
        ),
      );
      expect(line(results['mixed.md > mixed.md#0']?.stack, 'mixed.md')).toBe(
        '12',
      );
    });
  });
});
