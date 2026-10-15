import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { EDGE_PACKAGES, edgeSafe } from './edge-safe.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'edge-safe');

describe('edgeSafe', () => {
  it('names the packages that claim edge support', () => {
    expect(EDGE_PACKAGES).toEqual([
      'core',
      'node',
      'errors',
      'hono',
      'react-router',
      'next',
    ]);
  });

  it('accepts sources with neither eval nor new Function, and skips absent packages', () => {
    const result = edgeSafe(join(FIXTURES, 'clean'));
    expect(result.violations).toEqual([]);
    expect(result.scanned.packages).toBe(1);
  });

  it('reports eval( and new Function in sources, and ignores tests', () => {
    expect(edgeSafe(join(FIXTURES, 'sabotaged')).violations).toEqual([
      'libs/hono/src/index.ts:1 calls eval(; Vercel Edge disables it',
      'libs/hono/src/index.ts:2 calls new Function; Vercel Edge disables it',
      'libs/hono/src/index.ts:3 references eval; Vercel Edge disables it',
      'libs/hono/src/index.ts:4 reads globalThis.eval; Vercel Edge disables it',
      'libs/hono/src/index.ts:5 reads self.Function; Vercel Edge disables it',
      'libs/hono/src/index.ts:6 reads window.eval; Vercel Edge disables it',
    ]);
  });

  const live = edgeSafe(workspaceRoot);

  it('scans every edge package present in libs/', () => {
    expect(live.scanned.packages).toBeGreaterThanOrEqual(5);
    expect(live.scanned.files).toBeGreaterThan(0);
  });

  it('holds for the workspace', () => {
    expect(live.violations).toEqual([]);
  });
});
