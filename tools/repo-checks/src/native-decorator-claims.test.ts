import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  claimLines,
  claimsIn,
  isHistoricalPost,
} from './native-decorator-claims';

const CUTOFF = '2026-09-23';

/** Every `README.md` in the workspace. */
function readmeFiles(): string[] {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git'
      ) {
        return [];
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.name === 'README.md' ? [path] : [];
    });
  }

  return walk(workspaceRoot);
}

/** Every page under the docs snapshot, `docs/` and `blog/` included. */
function snapshotPages(): string[] {
  const root = join(workspaceRoot, 'apps/docs/snapshot');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.mdx?$/.test(entry.name) ? [path] : [];
    });
  }

  return walk(root);
}

/** Every README and docs snapshot page, read and made relative to the workspace root. */
function pages(): { file: string; source: string }[] {
  return [...readmeFiles(), ...snapshotPages()].map((path) => ({
    file: relative(workspaceRoot, path),
    source: readFileSync(path, 'utf8'),
  }));
}

describe('claimLines', () => {
  it('finds a line with the singular phrase', () => {
    expect(claimLines('Ships with a native decorator.')).toEqual([1]);
  });

  it('finds a line with the plural phrase, case-insensitive', () => {
    expect(claimLines('Uses NATIVE DECORATORS under the hood.')).toEqual([1]);
  });

  it('ignores a line that uses TypeScript decorators without the claim', () => {
    expect(claimLines('Uses TypeScript decorators for injection.')).toEqual([]);
  });

  it('ignores a hyphenated mention inside a link target', () => {
    expect(
      claimLines(
        '[the 0.3 announcement](./2025-06-26-native-decorators-simpler-modules.md)',
      ),
    ).toEqual([]);
  });

  it('reports every matching line, in order', () => {
    expect(
      claimLines(
        [
          'first line',
          'a native decorator here',
          'clean',
          'native decorators again',
        ].join('\n'),
      ),
    ).toEqual([2, 4]);
  });
});

describe('isHistoricalPost', () => {
  it('exempts a dated post from before the cutoff', () => {
    expect(
      isHistoricalPost(
        'apps/docs/snapshot/blog/2025-06-26-native-decorators-simpler-modules.md',
        CUTOFF,
      ),
    ).toBe(true);
  });

  it('does not exempt a post dated on the cutoff', () => {
    expect(
      isHistoricalPost(
        'apps/docs/snapshot/blog/2026-09-23-nexusdi-0-3-2.md',
        CUTOFF,
      ),
    ).toBe(false);
  });

  it('does not exempt a post dated after the cutoff', () => {
    expect(
      isHistoricalPost(
        'apps/docs/snapshot/blog/2026-10-01-0-4-release-candidate.md',
        CUTOFF,
      ),
    ).toBe(false);
  });

  it('does not exempt a file with no date prefix', () => {
    expect(isHistoricalPost('README.md', CUTOFF)).toBe(false);
  });
});

describe('claimsIn', () => {
  it('reports a claim outside an exempt historical post', () => {
    expect(
      claimsIn(
        [
          { file: 'README.md', source: 'Line one\nUses native decorators.\n' },
          {
            file: 'apps/docs/snapshot/blog/2025-01-01-old-post.md',
            source: 'native decorators everywhere',
          },
        ],
        CUTOFF,
      ),
    ).toEqual([{ file: 'README.md', line: 2 }]);
  });

  it('orders its report by file and then by line', () => {
    expect(
      claimsIn(
        [
          { file: 'b/README.md', source: 'native decorator' },
          {
            file: 'a/README.md',
            source: 'x\nnative decorator\nnative decorators',
          },
        ],
        CUTOFF,
      ),
    ).toEqual([
      { file: 'a/README.md', line: 2 },
      { file: 'a/README.md', line: 3 },
      { file: 'b/README.md', line: 1 },
    ]);
  });
});

describe('every readme and docs snapshot page', () => {
  it('carries no claim of native decorators', () => {
    const claims = claimsIn(pages(), CUTOFF);

    expect(
      claims.map((claim) => `${claim.file}:${claim.line}`),
      "NexusDI 0.3 uses TypeScript's legacy decorators behind " +
        'experimentalDecorators. No JavaScript engine ships decorators, and ' +
        '0.3 supports no TC39 standard decorator. Reword the claim.',
    ).toEqual([]);
  });
});
