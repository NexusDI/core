// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertBuilt, pagefindArgs } from './pagefind.mjs';

const dirs = [];
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

describe('the Pagefind step', () => {
  it('refuses to index a missing export', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pagefind-'));
    dirs.push(dir);
    expect(() => assertBuilt(join(dir, 'out'))).toThrow(
      /has no index\.html\. Run `npx nx build @nexusdi\/docs` first/,
    );
  });

  it('accepts an export with a landing page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pagefind-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'out'));
    writeFileSync(join(dir, 'out', 'index.html'), '<html></html>');
    expect(() => assertBuilt(join(dir, 'out'))).not.toThrow();
  });

  it('indexes out/ with no base URL, since Next adds the base path to each result', () => {
    expect(pagefindArgs('/x/out')).toEqual([
      'pagefind',
      '--site',
      '/x/out',
      '--output-path',
      '/x/out/_pagefind',
    ]);
  });
});
