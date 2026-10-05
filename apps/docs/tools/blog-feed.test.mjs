// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { atomFeed, entryId, readPosts, rssFeed } from './blog-feed.mjs';

let blog;

beforeAll(() => {
  blog = mkdtempSync(join(tmpdir(), 'blog-feed-'));
  writeFileSync(
    join(blog, 'index.mdx'),
    '---\ntitle: Blog\nkind: blog\n---\n\n# Blog\n',
  );
  writeFileSync(
    join(blog, 'first-release.mdx'),
    [
      '---',
      'title: Tabula Rasa',
      'kind: post',
      'date: 2025-06-22',
      'description: The first release & its plan.',
      'legacyId: https://nexus.js.org/blog/first-release',
      '---',
      '',
      '# Tabula Rasa',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(blog, '0-5-release.mdx'),
    [
      '---',
      'title: NexusDI 0.5',
      'kind: post',
      'date: 2027-03-01',
      'description: The 0.5 line.',
      '---',
      '',
    ].join('\n'),
  );
  writeFileSync(join(blog, 'notes.mdx'), '---\ntitle: Notes\n---\n');
});

afterAll(() => rmSync(blog, { recursive: true, force: true }));

describe('readPosts', () => {
  it('reads the kind: post pages newest first', () => {
    expect(readPosts(blog).map((post) => post.slug)).toEqual([
      '0-5-release',
      'first-release',
    ]);
  });
});

describe('entryId', () => {
  it('keeps the old feed id of a migrated post', () => {
    expect(entryId(readPosts(blog)[1])).toBe(
      'https://nexus.js.org/blog/first-release',
    );
  });

  it('gives a new post a tag URI', () => {
    expect(entryId(readPosts(blog)[0])).toBe(
      'tag:nexus.js.org,2027:blog/0-5-release',
    );
  });
});

describe('the feeds', () => {
  it('writes an Atom entry per post with its id, escaped', () => {
    const atom = atomFeed(readPosts(blog));
    expect(atom).toContain('<updated>2027-03-01T00:00:00Z</updated>');
    expect(atom).toContain('<id>https://nexus.js.org/blog/first-release</id>');
    expect(atom).toContain(
      '<summary>The first release &amp; its plan.</summary>',
    );
    expect(atom.match(/<entry>/g)).toHaveLength(2);
  });

  it('writes an RSS item per post with the id as its guid', () => {
    const rss = rssFeed(readPosts(blog));
    expect(rss).toContain(
      '<guid isPermaLink="false">tag:nexus.js.org,2027:blog/0-5-release</guid>',
    );
    expect(rss.match(/<item>/g)).toHaveLength(2);
  });

  it('writes valid empty feeds before any post has migrated', () => {
    expect(atomFeed([])).toContain('<updated>1970-01-01T00:00:00Z</updated>');
    expect(atomFeed([])).not.toContain('<entry>');
    expect(rssFeed([])).toContain('<channel>');
    expect(rssFeed([])).not.toContain('<item>');
  });
});
