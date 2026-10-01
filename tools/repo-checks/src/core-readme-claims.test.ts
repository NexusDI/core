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

/** How the README names each toolchain of the matrix. */
const DISPLAY: Record<string, Record<string, string>> = {
  plain: {
    tsc: 'tsc',
    tsgo: 'TypeScript 7',
    esbuild: 'esbuild',
    swc: 'SWC',
    babel: 'Babel',
    bun: 'Bun',
    deno: 'Deno',
    vite: 'Vite',
    'vite8+babel-plugin': 'Vite',
    'node-strip-types': "Node's type stripping",
  },
  decorated: {
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
  },
};

/** The bullet lines of `section`, the text between `## heading` and the next H2. */
function bulletsUnder(source: string, from: number, to: number): string[] {
  return source
    .slice(from, to === -1 ? undefined : to)
    .split('\n')
    .filter((line) => line.startsWith('- '));
}

/** The toolchains a `- Runs under a, b and c.` bullet names. */
function toolchainsIn(bullets: readonly string[]): string[] | undefined {
  return /^- Runs under (.+)\.$/
    .exec(bullets.find((b) => b.startsWith('- Runs under ')) ?? '')?.[1]
    ?.split(/, and |, | and /);
}

/** The display names of the matrix cells of `variant` with result `pass`. */
function passing(variant: 'plain' | 'decorated'): string[] {
  return matrix
    .filter((cell) => cell.variant === variant && cell.result === 'pass')
    .map((cell) => DISPLAY[variant]?.[cell.toolchain] as string);
}

/**
 * The README's opening makes three claims, each backed by something CI
 * proves: graph validation before any build, no runtime dependencies, and a
 * decorator-free core that every toolchain in the matrix builds and runs.
 * The decorators README names the toolchains that run decorators. Words
 * the README may not use at all (native, size figures) are in
 * npm-readmes.ts's banned list.
 */
describe('libs/core README', () => {
  it('leads with validation and zero dependencies before it mentions decorators', () => {
    const validation = head.search(/validates the whole module graph/);
    const dependencies = head.search(/no runtime dependencies/i);
    const decorators = head.search(/decorator/i);
    expect(validation).toBeGreaterThan(-1);
    expect(dependencies).toBeGreaterThan(-1);
    if (decorators !== -1) {
      expect(validation).toBeLessThan(decorators);
      expect(dependencies).toBeLessThan(decorators);
    }
  });

  it('names toolchains only while every plain cell of the matrix passes', () => {
    const plain = matrix.filter((cell) => cell.variant === 'plain');
    expect(plain).toHaveLength(10);
    expect(plain.every((cell) => cell.result === 'pass')).toBe(true);
    const features = readme.indexOf('## Features');
    expect(features).toBeGreaterThan(-1);
    const listed = toolchainsIn(
      bulletsUnder(readme, features, readme.indexOf('\n## ', features + 1)),
    );
    expect(listed).toBeDefined();
    expect(new Set(listed)).toEqual(new Set(passing('plain')));
  });

  it('leads with modules and async startup, and starts with classes as tokens', () => {
    expect(head).toContain(
      'NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.',
    );
    const quickStart = readme.slice(readme.indexOf('## Quick start'));
    const firstBlock = quickStart.slice(
      0,
      quickStart.indexOf('```\n', quickStart.indexOf('```ts')),
    );
    expect(firstBlock).not.toContain('Token<');
    expect(firstBlock).toContain('Nexus.create([');
  });

  it('closes with when you do not need a container', () => {
    expect(readme).toContain('## When you do not need a container');
    expect(
      readme.indexOf('## When you do not need a container'),
    ).toBeGreaterThan(readme.indexOf('## Packages'));
  });

  it('claims no runtime dependencies only while package.json declares none', () => {
    const manifest = JSON.parse(
      readFileSync(join(workspaceRoot, 'libs/core/package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies ?? {}).toEqual({});
  });
});

describe('libs/decorators README', () => {
  const decorators = readFileSync(
    join(workspaceRoot, 'libs/decorators/README.md'),
    'utf-8',
  );
  const bullets = bulletsUnder(decorators, 0, decorators.indexOf('\n## '));

  it('names as decorator toolchains exactly those whose decorated cell passes', () => {
    const decorated = matrix.filter((cell) => cell.variant === 'decorated');
    expect(decorated).toHaveLength(10);
    const listed = toolchainsIn(bullets);
    expect(listed).toBeDefined();
    expect(new Set(listed)).toEqual(new Set(passing('decorated')));
    expect(bullets.join('\n')).not.toMatch(
      /decorators[^.]*need no compiler flag/i,
    );
  });

  it('names every toolchain whose decorated cell fails in one bullet that says it cannot run them', () => {
    const cannot = bullets.find((b) => b.includes('cannot run them')) ?? '';
    expect(cannot).not.toBe('');
    for (const cell of matrix.filter(
      (c) => c.variant === 'decorated' && c.result !== 'pass',
    )) {
      const name = DISPLAY['decorated']?.[cell.toolchain];
      expect(name).toBeDefined();
      expect(cannot).toContain(name);
    }
  });
});
