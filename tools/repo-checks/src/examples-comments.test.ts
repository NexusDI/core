import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { citations, isRead } from './examples-comments.js';

const at = (path: string, text: string) => citations([{ path, text }]);

describe('citations', () => {
  it.each([
    ['a spec section', '// Runs once (spec 9.8).'],
    ['a spec named in full', '// The ship systems spec (section 14).'],
    ['a section number', '/** See section 3.8. */'],
    ['a section sign', '// Per §4.'],
    ['a G-number', '// This is G7 again.'],
    ['a G-number with a letter', '// Closes G0b.'],
    ['a task number', "// Task 20's module-scope entry shows that form."],
    ['a bare task id', '// Added by T12.'],
    ['a ruling', '// The owner ruled on this.'],
    ['an earlier version', '// This used to read the clock.'],
    [
      'an earlier version, spelled out',
      '// An earlier version read the clock.',
    ],
    ['a prerelease', '// Fixed after rc.1.'],
    ['previously', '// Previously a global.'],
  ])('reports %s in a line comment', (_name, comment) => {
    expect(
      at('examples/a/src/x.ts', `const a = 1;\n${comment}\n`),
    ).toHaveLength(1);
  });

  it('reports the line of a hit inside a block comment', () => {
    expect(
      at('examples/a/src/x.ts', '/**\n * Fine.\n * Task 4 did it.\n */\n'),
    ).toEqual(['examples/a/src/x.ts:3 cites a task number: * Task 4 did it.']);
  });

  it('reads comments in css, html, jsonc and gitignore files', () => {
    expect(at('examples/a/app.css', '/* spec 9.1 */\n.a {}\n')).toHaveLength(1);
    expect(at('examples/a/index.html', '<p>Task 3</p>\n')).toHaveLength(0);
    expect(at('examples/a/index.html', '<!-- Task 3 -->\n')).toHaveLength(1);
    expect(at('examples/a/w.jsonc', '{\n  // spec 9.2\n}\n')).toHaveLength(1);
    expect(at('examples/a/.gitignore', '# spec 1.2\ndist\n')).toHaveLength(1);
  });

  it.each([
    ['a version string', "export const VERSION = 'rc.1';"],
    ['a CSS grid area string', "const area = 'G1 G2';"],
    ['a template literal', 'const s = `// Task 3 and spec 9.1`;'],
    ['a string holding a comment marker', "const u = 'http://x/spec 9.1';"],
    ['a regular expression', 'const r = /\\/\\/ spec 9/;'],
    ['an identifier', 'const T1 = 1; const spec = 2;'],
    ['a type parameter in code', 'function f<T1>(a: T1) { return a; }'],
  ])('ignores %s in code', (_name, code) => {
    expect(at('examples/a/src/x.ts', `${code}\n`)).toEqual([]);
  });

  it.each([
    '// The value is used to build the key.',
    '// A token used to resolve the sink.',
    '// Reads the config used by the loader.',
    '// Each section of the page.',
    '// The grid has two sections.',
    '// Pins the response so the log holds two entries.',
  ])('accepts %s', (comment) => {
    expect(at('examples/a/src/x.ts', `${comment}\n`)).toEqual([]);
  });

  it('reads only the code comments in a Markdown page', () => {
    const page = [
      'The spec says so, and Task 4 added it.',
      '',
      '```ts',
      '// Task 4 added this.',
      'const a = 1;',
      '```',
      '',
      '```text',
      '// Task 5 in plain text',
      '```',
    ].join('\n');
    expect(at('examples/a/pages/x.md', page)).toEqual([
      'examples/a/pages/x.md:4 cites a task number: Task 4 added this.',
    ]);
  });
});

describe('isRead', () => {
  it('skips goldens, generated typings and files outside examples', () => {
    expect(isRead('examples/meridian-systems/e2e/golden/a.ts')).toBe(false);
    expect(isRead('examples/bridge-api/worker-configuration.d.ts')).toBe(false);
    expect(isRead('libs/core/src/x.ts')).toBe(false);
    expect(isRead('examples/a/src/x.ts')).toBe(true);
    expect(isRead('examples/a/x.json')).toBe(false);
  });
});

describe('examples/', () => {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      'examples',
    ],
    { cwd: workspaceRoot, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split('\0')
    .filter((path) => path !== '' && isRead(path))
    .map((path) => ({
      path,
      text: readFileSync(join(workspaceRoot, path), 'utf-8'),
    }));

  it('finds the example sources', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('holds no comment that cites a spec, task, ruling or earlier version', () => {
    expect(citations(files)).toEqual([]);
  });
});
