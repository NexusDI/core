import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  checkRegions,
  regionRoots,
  wiresDocExamples,
} from './docs/doc-regions';
import { loadRegions } from './docs/loaders';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ROOT = join(FIXTURES, 'doc-regions');

describe('region roots', () => {
  it('lists the example and the packages that wire doc examples', () => {
    expect(regionRoots(ROOT)).toEqual([
      'examples/meridian/',
      'libs/wired/README.md',
      'libs/wired/docs/**/*.md',
    ]);
  });

  it('lists no codemod root and every wired package of the workspace', () => {
    const roots = regionRoots(workspaceRoot);
    expect(roots).toContain('examples/meridian/');
    expect(roots).toContain('libs/core/README.md');
    expect(roots).toContain('libs/core/docs/**/*.md');
    expect(roots.some((root) => root.startsWith('libs/codemod/'))).toBe(false);
  });
});

describe('wiresDocExamples', () => {
  it('reads calls and skips comments', () => {
    expect(wiresDocExamples('docExamples();\ndocExampleSources();')).toBe(true);
    expect(
      wiresDocExamples(
        '// docExampleSources()\n/* docExamples( */\ndocExamples();',
      ),
    ).toBe(false);
  });
});

describe('doc-regions fixtures', () => {
  it('passes a clean tree', async () => {
    const { readRegion } = await loadRegions();
    expect(
      checkRegions({
        pages: readSite(join(ROOT, 'clean', 'content')),
        root: ROOT,
        roots: regionRoots(ROOT),
        readRegion,
      }),
    ).toEqual([]);
  });

  it('fails a missing region, a missing file, a file outside the roots and a package without the wiring', async () => {
    const { readRegion } = await loadRegions();
    const findings = checkRegions({
      pages: readSite(join(ROOT, 'sabotaged', 'content')),
      root: ROOT,
      roots: regionRoots(ROOT),
      readRegion,
    });
    expect(findings).toHaveLength(4);
    expect(
      findings.some((finding) =>
        finding.includes(
          ":14: 'apps/docs/scratch.ts' is outside the region roots (examples/meridian/, libs/wired/README.md, libs/wired/docs/**/*.md)",
        ),
      ),
    ).toBe(true);
    expect(
      findings.some((finding) =>
        finding.includes(
          ":17: 'libs/unwired/docs/crew.md' is outside the region roots",
        ),
      ),
    ).toBe(true);
    expect(
      findings.some((finding) =>
        finding.includes(":11: cannot read 'examples/meridian/src/missing.ts'"),
      ),
    ).toBe(true);
    expect(
      findings.some(
        (finding) => finding.includes(':8: ') && finding.includes('reactor'),
      ),
    ).toBe(true);
  });
});

describe('doc-regions path escapes', () => {
  it('rejects a path that climbs out of a root with `..`', () => {
    const fence = (path: string) =>
      ({
        line: 3,
        meta: `ts file=${path} region=x`,
      }) as never;
    const page = (path: string) =>
      ({ file: 'p.mdx', fences: [fence(path)] }) as never;
    const findings = checkRegions({
      pages: [
        page('examples/meridian/../../apps/docs/x.ts'),
        page('examples/meridian/src/../src/a.ts'),
      ],
      root: ROOT,
      roots: ['examples/meridian/'],
      readRegion: () => {
        throw new Error('unreachable');
      },
    });
    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(finding).toContain('is outside the region roots');
    }
  });
});

describe('doc-regions on apps/docs', () => {
  it('holds', async () => {
    const { readRegion } = await loadRegions();
    expect(
      checkRegions({
        pages: readSite(CONTENT),
        root: workspaceRoot,
        roots: regionRoots(workspaceRoot),
        readRegion,
      }),
    ).toEqual([]);
  });
});
