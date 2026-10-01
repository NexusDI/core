import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expandRegions } from '@nexusdi/doc-examples/mdx-region-loader';
import { RegionError } from '@nexusdi/doc-examples/regions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const fence = '```';
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'nexusdi-regions-'));
  mkdirSync(join(root, 'libs/core'), { recursive: true });
  writeFileSync(
    join(root, 'libs/core/README.md'),
    [
      '# NexusDI',
      '',
      '<!-- #region first-ship -->',
      `${fence}ts`,
      'const frequency = 1420;',
      fence,
      '<!-- #endregion first-ship -->',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'libs/core/doc-examples.preamble.ts'),
    "import { Nexus } from '@nexusdi/core';\n",
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('expandRegions', () => {
  it('fills an empty fence from the named README region', () => {
    expect(
      expandRegions(
        `${fence}ts file=libs/core/README.md region=first-ship\n${fence}\n`,
        root,
        'tokens.mdx',
      ),
    ).toBe(`${fence}ts\nconst frequency = 1420;\n${fence}\n`);
  });

  it('puts the README preamble behind a cut in a twoslash fence', () => {
    const out = expandRegions(
      `${fence}ts twoslash file=libs/core/README.md region=first-ship\n${fence}\n`,
      root,
      'tokens.mdx',
    );

    expect(out).toBe(
      `${fence}ts twoslash\nimport { Nexus } from '@nexusdi/core';\n// ---cut---\nconst frequency = 1420;\n${fence}\n`,
    );
  });

  it('drops the placeholder lines an author left inside the fence', () => {
    expect(
      expandRegions(
        `${fence}ts file=libs/core/README.md region=first-ship\nstale\n${fence}\n`,
        root,
        'tokens.mdx',
      ),
    ).not.toContain('stale');
  });

  it('fails the build on a region the README does not have', () => {
    expect(() =>
      expandRegions(
        `${fence}ts file=libs/core/README.md region=missing\n${fence}\n`,
        root,
        'tokens.mdx',
      ),
    ).toThrow(RegionError);
  });

  it('fails the build on a file that does not exist, naming the page', () => {
    expect(() =>
      expandRegions(
        `${fence}ts file=libs/core/NOPE.md region=first-ship\n${fence}\n`,
        root,
        'tokens.mdx',
      ),
    ).toThrow(
      "tokens.mdx: cannot read 'libs/core/NOPE.md', referenced by region 'first-ship'",
    );
  });
});
