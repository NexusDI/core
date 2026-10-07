import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { proseOf } from './npm-readmes.js';

const read = (path: string) => readFileSync(join(workspaceRoot, path), 'utf-8');

const matrix = JSON.parse(
  read('examples/toolchain-matrix/toolchain-matrix.json'),
) as { toolchain: string; variant: string; result: string }[];

/**
 * How a README mentions each toolchain of the matrix. Vite counts unless the
 * same sentence names its Babel plugin, the cell that runs decorators.
 */
const MENTION: Record<string, RegExp> = {
  tsc: /\btsc\b/,
  tsgo: /\bTypeScript 7\b|\btsgo\b/,
  esbuild: /\besbuild\b/i,
  swc: /\bSWC\b/,
  babel: /\bBabel\b(?! plugin)/,
  bun: /\bBun\b/,
  deno: /\bDeno\b/,
  vite: /\bVite\b(?![^.\n]*Babel plugin)/i,
  'vite8+babel-plugin': /\bVite\b[^.\n]*Babel plugin/i,
  'node-strip-types': /type[- ]stripping/i,
};

/** The toolchains of `variant` whose cell does not pass. */
function failing(variant: 'plain' | 'decorated'): string[] {
  return matrix
    .filter((cell) => cell.variant === variant && cell.result !== 'pass')
    .map((cell) => cell.toolchain);
}

/**
 * Each prose line that names `toolchain` as one that works: every line that
 * mentions it, less the lines that say it cannot run the code.
 */
function claims(prose: string, toolchain: string): string[] {
  const mention = MENTION[toolchain];
  expect(mention, `no MENTION pattern for ${toolchain}`).toBeDefined();
  return prose
    .split('\n')
    .filter((line) => mention?.test(line) && !/cannot run/i.test(line));
}

/**
 * The claims a README makes that CI proves or disproves: the toolchains it
 * names run the code, the dependencies it says it lacks are absent, and core
 * starts with classes as their own tokens. Words a README may not use at all
 * (native, size figures) are in npm-readmes.ts's banned list.
 */
describe('libs/core README', () => {
  const readme = read('libs/core/README.md');
  const quickStart = readme.search(/^## Quick Start$/im);

  it('starts with classes as tokens', () => {
    expect(quickStart).toBeGreaterThan(-1);
    const rest = readme.slice(quickStart);
    const open = rest.indexOf('```ts');
    const firstBlock = rest.slice(open, rest.indexOf('```\n', open + 3));
    expect(firstBlock).not.toContain('Token<');
    expect(firstBlock).toContain('Nexus.create([');
  });

  it('leads with validation before it mentions decorators', () => {
    const head = readme.slice(0, quickStart);
    const validation = head.search(/validat/i);
    const decorators = head.search(/decorator/i);
    expect(validation).toBeGreaterThan(-1);
    if (decorators !== -1) expect(validation).toBeLessThan(decorators);
  });

  it.each(['libs/core/README.md', 'README.md'])(
    '%s names no toolchain whose plain cell fails',
    (path) => {
      const prose = proseOf(read(path));
      for (const toolchain of failing('plain'))
        expect(claims(prose, toolchain)).toEqual([]);
    },
  );

  it('claims no runtime dependencies only while package.json declares none', () => {
    const claimsNone = /\b(no|zero) runtime dependencies\b/i.test(readme);
    const manifest = JSON.parse(read('libs/core/package.json')) as {
      dependencies?: Record<string, string>;
    };
    if (claimsNone) expect(manifest.dependencies ?? {}).toEqual({});
  });
});

describe('libs/decorators README', () => {
  const readme = read('libs/decorators/README.md');
  const prose = proseOf(readme);

  it('names no toolchain whose decorated cell fails as one that runs them', () => {
    expect(matrix.filter((cell) => cell.variant === 'decorated')).toHaveLength(
      10,
    );
    for (const toolchain of failing('decorated'))
      expect(claims(prose, toolchain)).toEqual([]);
    expect(prose).not.toMatch(/decorators[^.]*need no compiler flag/i);
  });

  it('names every toolchain whose decorated cell fails on a line that says it cannot run these decorators', () => {
    const cannot = prose
      .split('\n')
      .filter((line) => line.includes('cannot run these decorators'));
    expect(cannot).not.toEqual([]);
    for (const toolchain of failing('decorated'))
      expect(cannot.some((line) => MENTION[toolchain]?.test(line))).toBe(true);
  });
});
