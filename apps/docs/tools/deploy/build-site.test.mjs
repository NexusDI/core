// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildPlan } from './build-site.mjs';

const dirs = [];
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

function checkout({ blog = true, results = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'build-site-'));
  dirs.push(dir);
  if (blog) {
    mkdirSync(join(dir, 'apps/docs/content/blog'), { recursive: true });
    writeFileSync(join(dir, 'apps/docs/content/blog/index.mdx'), '# Blog\n');
  }
  if (results) {
    mkdirSync(join(dir, 'benchmarks/results'), { recursive: true });
    writeFileSync(join(dir, 'benchmarks/results/size.json'), '{}');
  }
  return dir;
}

const COMMANDS = [
  ['npx', 'nx', 'build', '@nexusdi/docs'],
  ['npm', '--prefix', 'apps/docs', 'run', 'postbuild'],
  ['node', 'apps/docs/tools/check-budgets.mjs'],
];

describe('buildPlan for /next/', () => {
  it('builds the tree under /next on the next channel and copies nothing', () => {
    expect(buildPlan('next', { tree: '/w/next-src' })).toEqual({
      env: { DOCS_BASE_PATH: '/next', DOCS_CHANNEL: 'next' },
      copies: [],
      commands: COMMANDS,
    });
  });
});

describe('buildPlan for the root', () => {
  it('copies the blog from main and builds with no base path on the release channel', () => {
    const main = checkout();
    const tree = checkout({ blog: false });
    expect(buildPlan('root', { tree, main })).toEqual({
      env: { DOCS_BASE_PATH: '', DOCS_CHANNEL: 'release' },
      copies: [
        {
          from: join(main, 'apps/docs/content/blog'),
          to: join(tree, 'apps/docs/content/blog'),
        },
      ],
      commands: COMMANDS,
    });
  });

  it('copies the benchmark results too when main has them', () => {
    const main = checkout({ results: true });
    const tree = checkout();
    expect(buildPlan('root', { tree, main }).copies).toContainEqual({
      from: join(main, 'benchmarks/results'),
      to: join(tree, 'benchmarks/results'),
    });
  });

  it('copies nothing when the tree is main', () => {
    const main = checkout();
    expect(buildPlan('root', { tree: main, main }).copies).toEqual([]);
  });

  it('stops with the fix when main has no blog', () => {
    const main = checkout({ blog: false });
    expect(() => buildPlan('root', { tree: checkout(), main })).toThrow(
      'final mode builds the root with the blog from main, and main has no apps/docs/content/blog. Add the blog before setting final (docs spec section 6).',
    );
  });
});

describe('buildPlan arguments', () => {
  it('refuses an unknown kind', () => {
    expect(() => buildPlan('preview', { tree: '.' })).toThrow(
      'build-site.mjs builds "next" or "root"; received "preview".',
    );
  });

  it('needs main for the root', () => {
    expect(() => buildPlan('root', { tree: '.' })).toThrow(
      'the root build needs --main, the checkout whose blog it copies.',
    );
  });
});
