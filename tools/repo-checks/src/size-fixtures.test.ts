import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { libPackages } from './entry-graph.js';
import {
  budgetViolations,
  hasTextExport,
  sizeFixtureViolations,
} from './size-fixtures.js';

const TEXT_EXPORT = { './text': { '@nexusdi/source': './src/text.ts' } };

describe('sizeFixtureViolations', () => {
  it('accepts a ./text export with its fixture, and a package with neither', () => {
    expect(
      sizeFixtureViolations(
        [
          { dir: 'cache', exports: TEXT_EXPORT },
          { dir: 'plain', exports: { '.': './src/index.ts' } },
        ],
        ['cache.ts', 'cache-text.ts', 'plain.ts'],
      ),
    ).toEqual([]);
  });

  it('reports a ./text export with no fixture, and a fixture with no ./text export', () => {
    expect(
      sizeFixtureViolations(
        [
          { dir: 'cache', exports: TEXT_EXPORT },
          { dir: 'plain', exports: { '.': './src/index.ts' } },
        ],
        ['cache.ts', 'plain-text.ts', 'gone-text.ts'],
      ),
    ).toEqual([
      'libs/cache exports ./text, and examples/size/src/cache-text.ts is missing, so npm run size does not measure its pack',
      'examples/size/src/gone-text.ts measures a pack, and libs/gone has no ./text export',
      'examples/size/src/plain-text.ts measures a pack, and libs/plain has no ./text export',
    ]);
  });

  it('accepts a feature fixture of a package, and reports one whose package is gone', () => {
    expect(
      sizeFixtureViolations(
        [{ dir: 'devtools', exports: { '.': './src/index.ts' } }],
        ['devtools.ts', 'devtools-profile.ts', 'gone-profile.ts'],
      ),
    ).toEqual([
      'examples/size/src/gone-profile.ts measures a feature of libs/gone, which is no package',
    ]);
  });

  it('holds for the workspace', () => {
    const packages = libPackages(join(workspaceRoot, 'libs'));
    const fixtures = readdirSync(
      join(workspaceRoot, 'examples', 'size', 'src'),
    );
    expect(packages.filter(hasTextExport)).not.toHaveLength(0);
    expect(sizeFixtureViolations(packages, fixtures)).toEqual([]);
  });
});

describe('budgetViolations', () => {
  it('accepts an entry with a budget and a reason', () => {
    expect(
      budgetViolations(
        {
          hono: { external: ['hono'], budget: 1500, reason: 'the middleware' },
        },
        ['hono.ts'],
      ),
    ).toEqual([]);
  });

  it('reports an entry with no budget, no reason or no fixture', () => {
    expect(
      budgetViolations(
        {
          hono: { external: ['hono'] },
          express: { budget: 1500, reason: ' ' },
          gone: { budget: 1, reason: 'a fixture that left' },
        },
        ['hono.ts', 'express.ts'],
      ),
    ).toEqual([
      'examples/size/src/fixtures.json: hono has no positive budget',
      'examples/size/src/fixtures.json: hono gives no reason for its budget',
      'examples/size/src/fixtures.json: express gives no reason for its budget',
      'examples/size/src/fixtures.json: gone has no fixture gone.ts',
    ]);
  });

  it('gives every adapter fixture a budget, in the workspace', () => {
    const fixtures = readdirSync(
      join(workspaceRoot, 'examples', 'size', 'src'),
    );
    const options = JSON.parse(
      readFileSync(
        join(workspaceRoot, 'examples', 'size', 'src', 'fixtures.json'),
        'utf8',
      ),
    ) as Record<string, object>;
    for (const adapter of [
      'express',
      'fastify',
      'hono',
      'react-router',
      'react',
      'hono-worker',
    ])
      expect(options[adapter], adapter).toBeDefined();
    expect(budgetViolations(options, fixtures)).toEqual([]);
  });
});
