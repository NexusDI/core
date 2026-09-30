import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { libPackages } from './entry-graph.js';
import { hasTextExport, sizeFixtureViolations } from './size-fixtures.js';

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

  it('holds for the workspace', () => {
    const packages = libPackages(join(workspaceRoot, 'libs'));
    const fixtures = readdirSync(
      join(workspaceRoot, 'examples', 'size', 'src'),
    );
    expect(packages.filter(hasTextExport)).not.toHaveLength(0);
    expect(sizeFixtureViolations(packages, fixtures)).toEqual([]);
  });
});
