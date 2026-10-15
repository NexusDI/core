import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mdSiblings } from '@nexusdi/doc-examples/md-siblings';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadReferenceOptions, type ReferenceOptions } from './docs/loaders';

const fence = '```';
let root: string;
let content: string;
let options: ReferenceOptions;

beforeAll(async () => {
  options = await loadReferenceOptions();
  root = mkdtempSync(join(tmpdir(), 'nexusdi-siblings-'));
  content = join(root, 'apps/docs/content');
  mkdirSync(join(root, 'libs/core'), { recursive: true });
  mkdirSync(join(content, 'errors'), { recursive: true });
  writeFileSync(
    join(root, 'libs/core/README.md'),
    [
      '<!-- #region first-ship -->',
      `${fence}ts`,
      'const frequency = 1420;',
      fence,
      '<!-- #endregion first-ship -->',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(content, 'tokens.mdx'),
    [
      '# Tokens',
      '',
      `${fence}ts file=libs/core/README.md region=first-ship`,
      fence,
      '',
    ].join('\n'),
  );
  writeFileSync(join(content, 'index.mdx'), '# NexusDI\n');
  writeFileSync(
    join(content, 'errors/NEXUS_MISSING_PROVIDER.mdx'),
    '# NEXUS_MISSING_PROVIDER\n',
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('mdSiblings', () => {
  it('writes one sibling per page, keyed by its path under the export', () => {
    const siblings = mdSiblings(content, root, options);
    expect([...siblings.keys()].sort()).toEqual([
      'errors/NEXUS_MISSING_PROVIDER.md',
      'index.md',
      'tokens.md',
    ]);
  });

  it('carries the region code the page renders', () => {
    const siblings = mdSiblings(content, root, options);
    expect(siblings.get('tokens.md')).toBe(
      `# Tokens\n\n${fence}ts\nconst frequency = 1420;\n${fence}\n`,
    );
  });

  it('passes both class prefixes to the reference expansion', () => {
    expect(() => mdSiblings(content, root, {} as never)).toThrow(TypeError);
    expect(() =>
      mdSiblings(content, root, { classPrefix: 'nexus' } as never),
    ).toThrow(/kindPrefix/);
  });
});
