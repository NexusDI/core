import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  join(workspaceRoot, 'libs/core/README.md'),
  'utf-8',
);
const head = readme.slice(0, readme.indexOf('## Quick start'));
const matrix = JSON.parse(
  readFileSync(
    join(workspaceRoot, 'examples/toolchain-matrix/toolchain-matrix.json'),
    'utf-8',
  ),
) as { toolchain: string; variant: string; result: string }[];

/**
 * The README's opening makes four claims, each backed by something CI
 * proves: graph validation before any build, no runtime dependencies, a
 * decorator-free core that every toolchain in the matrix builds and runs, and
 * decorators on exactly the toolchains whose decorated cell passes.
 */
describe('libs/core README', () => {
  it('never calls anything native', () => {
    expect(readme).not.toMatch(/\bnative\b/i);
  });

  it('leads with validation and zero dependencies before it mentions decorators', () => {
    const validation = head.search(/validates the whole module graph/);
    const dependencies = head.search(/no runtime dependencies/i);
    const decorators = head.search(/decorator/i);
    expect(validation).toBeGreaterThan(-1);
    expect(dependencies).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(decorators);
    expect(dependencies).toBeLessThan(decorators);
  });

  it('names toolchains only while every plain cell of the matrix passes', () => {
    const plain = matrix.filter((cell) => cell.variant === 'plain');
    expect(plain).toHaveLength(10);
    expect(plain.every((cell) => cell.result === 'pass')).toBe(true);
  });

  it('names as decorator toolchains exactly those whose decorated cell passes', () => {
    const display: Record<string, string> = {
      tsc: 'tsc',
      tsgo: 'TypeScript 7',
      esbuild: 'esbuild',
      swc: 'SWC',
      babel: 'Babel',
      bun: 'Bun',
      deno: 'Deno',
      vite: 'Vite on its own',
      'node-strip-types': "Node's type stripping",
      'vite8+babel-plugin': 'Vite with its Babel plugin',
    };
    const start = head.indexOf('Decorators are optional.');
    expect(start).toBeGreaterThan(-1);
    const paragraph = head.slice(start, head.indexOf('\n\n', start));
    expect(paragraph).not.toMatch(/decorators[^.]*need no compiler flag/i);
    const listed = /compiles standard decorators: (.+?)\. /
      .exec(paragraph)?.[1]
      ?.split(/, and |, | and /);
    const decorated = matrix.filter((cell) => cell.variant === 'decorated');
    expect(decorated).toHaveLength(10);
    const passing = decorated
      .filter((cell) => cell.result === 'pass')
      .map((cell) => display[cell.toolchain]);
    expect(new Set(listed)).toEqual(new Set(passing));
    const cannot =
      paragraph.split('. ').find((s) => s.includes('cannot run them')) ?? '';
    for (const cell of decorated.filter((c) => c.result !== 'pass')) {
      const name = display[cell.toolchain];
      expect(name).toBeDefined();
      expect(cannot).toContain(name);
    }
  });

  it('claims no runtime dependencies only while package.json declares none', () => {
    const manifest = JSON.parse(
      readFileSync(join(workspaceRoot, 'libs/core/package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies ?? {}).toEqual({});
  });
});
