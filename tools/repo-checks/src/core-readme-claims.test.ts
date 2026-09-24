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
 * The README's opening makes three claims, each backed by something CI
 * proves: graph validation before any build, no runtime dependencies, and a
 * decorator-free core that every toolchain in the matrix builds and runs.
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

  it('claims no runtime dependencies only while package.json declares none', () => {
    const manifest = JSON.parse(
      readFileSync(join(workspaceRoot, 'libs/core/package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies ?? {}).toEqual({});
  });
});
