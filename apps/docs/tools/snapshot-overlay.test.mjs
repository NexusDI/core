// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  announcementBar,
  newestPublishedPost,
} from '../snapshot/announcement.mjs';
import { overlayFiles, sourcePages, strayPages } from './snapshot-overlay.mjs';

const snapshot = join(import.meta.dirname, '..', 'snapshot');
const workspace = join(import.meta.dirname, '..', '..', '..');
const fixtures = join(import.meta.dirname, '__fixtures__', 'snapshot-blog');
const text = (path) => readFileSync(join(snapshot, path), 'utf8');

/**
 * Every file the overlay carries, with its kind. Page replacements under
 * docs/ and posts under blog/ are read from disk, so a file added to either
 * folder gets its own row.
 */
const rows = [
  ['docusaurus.overlay.root.ts', 'config'],
  ['docusaurus.overlay.archive.ts', 'config'],
  ['announcement.mjs', 'config'],
  ['src/pages/index.tsx', 'landing page'],
  ...overlayFiles(snapshot, 'docs').map((file) => [
    `docs/${file}`,
    'page replacement',
  ]),
  ...overlayFiles(snapshot, 'blog').map((file) => [
    `blog/${file}`,
    /^tags: \[.*\brelease-candidate\b.*\]$/m.test(text(`blog/${file}`))
      ? 'rc post'
      : 'post',
  ]),
];

describe('the snapshot overlay', () => {
  it.each(rows)('holds %s (%s)', (path, kind) => {
    expect(existsSync(join(snapshot, path))).toBe(true);

    if (kind === 'page replacement') {
      expect(path).toMatch(/\.mdx?$/);
      expect(text(path).trim()).not.toBe('');
    }

    if (kind === 'post' || kind === 'rc post') {
      expect(path).toMatch(/^blog\/\d{4}-\d{2}-\d{2}-[\w-]+\.mdx?$/);
      expect(text(path)).toMatch(/^---\n[\s\S]*^title: .+$[\s\S]*^---$/m);
      expect(text(path)).toMatch(/^authors: \[.+\]$/m);
    }
  });

  it('holds the RC post among its rows', () => {
    expect(rows).toContainEqual([
      'blog/2026-10-01-0-4-release-candidate.md',
      'rc post',
    ]);
  });

  it('turns the blog off and noindex on in the archive variant', () => {
    const archive = text('docusaurus.overlay.archive.ts');
    expect(archive).toMatch(/baseUrl:\s*'\/v0\.3\/'/);
    expect(archive).toMatch(/noIndex:\s*true/);
    expect(archive).toMatch(/blog:\s*false/);
    expect(archive).toMatch(/isCloseable:\s*false/);
    expect(archive).toContain("href: 'https://nexus.js.org/blog/'");
  });

  it('keeps the root variant at the bare path', () => {
    expect(text('docusaurus.overlay.root.ts')).toMatch(/baseUrl:\s*'\/'/);
  });

  it('routes the landing page logo through the base URL', () => {
    const page = text('src/pages/index.tsx');
    expect(page).not.toContain('src="/img/');
    expect(page).toContain("useBaseUrl('/img/logo-white.svg')");
  });

  it('holds the RC post as a draft until Phase 2', () => {
    expect(text('blog/2026-10-01-0-4-release-candidate.md')).toMatch(
      /^draft: true$/m,
    );
  });
});

describe('page replacements', () => {
  it('flags an overlay page whose path names no 0.3 page', () => {
    expect(
      strayPages(
        ['faq.md', 'contributing/docs.md', 'fqa.md'],
        ['faq.md', 'contributing/docs.md', 'intro.md'],
      ),
    ).toEqual(['fqa.md']);
  });

  it('replaces only pages that exist at 6d5e4f3', () => {
    expect(
      strayPages(
        overlayFiles(snapshot, 'docs'),
        sourcePages('6d5e4f3', workspace),
      ),
      'A file under apps/docs/snapshot/docs/ must carry the path of the page it ' +
        'replaces under docs/docs/ at 6d5e4f3. Rename it to that path, or delete it.',
    ).toEqual([]);
  });
});

describe('newestPublishedPost', () => {
  it('ignores a post without the release-candidate tag', () => {
    expect(newestPublishedPost(join(fixtures, 'published')).file).not.toBe(
      '2025-06-22-first-release.md',
    );
  });

  it('finds nothing while the only RC post is a draft', () => {
    expect(newestPublishedPost(join(snapshot, 'blog'))).toBeNull();
  });

  it('finds the newest published RC post and its date permalink', () => {
    expect(newestPublishedPost(join(fixtures, 'published'))).toEqual({
      file: '2026-10-01-0-4-release-candidate.md',
      permalink: '/blog/2026/10/01/0-4-release-candidate',
    });
  });
});

describe('announcementBar', () => {
  it('adds no bar without a published RC post', () => {
    expect(announcementBar(null)).toBeUndefined();
  });

  it('links the post and the upgrade guide', () => {
    const bar = announcementBar({
      file: '2026-10-01-0-4-release-candidate.md',
      permalink: '/blog/2026/10/01/0-4-release-candidate',
    });
    expect(bar).toEqual({
      id: 'rc-2026-10-01-0-4-release-candidate',
      isCloseable: true,
      content:
        'NexusDI 0.4 is in release candidate. Read the <a href="/blog/2026/10/01/0-4-release-candidate">announcement</a>, or the <a href="/next/upgrade/">upgrade guide</a>.',
    });
  });
});
