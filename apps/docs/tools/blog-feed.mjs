import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'yaml';

/**
 * Writes the blog's Atom and RSS feeds at the two paths the Docusaurus blog
 * published, `/blog/atom.xml` and `/blog/rss.xml`, so a subscriber's reader
 * keeps working after the swap (spec §6.2). It runs in `postbuild` after the
 * siblings, and only when the build holds the blog: the `next` channel
 * leaves `content/blog/` out.
 */

const SITE = 'https://nexus.js.org';
const EPOCH = '1970-01-01';

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const escape = (text) => String(text).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);

const isoDate = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value);

/** Every post in `blogDir`, newest first: the `.mdx` files with `kind: post`. */
export function readPosts(blogDir) {
  return readdirSync(blogDir)
    .filter((name) => name.endsWith('.mdx') && name !== 'index.mdx')
    .map((name) => {
      const source = readFileSync(join(blogDir, name), 'utf8');
      const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
      const matter = match ? (parse(match[1]) ?? {}) : {};
      return { ...matter, slug: name.slice(0, -'.mdx'.length) };
    })
    .filter((post) => post.kind === 'post')
    .map((post) => ({ ...post, date: isoDate(post.date) }))
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
    );
}

/** A migrated post keeps the id its old feed gave it, so a reader shows no duplicate. */
export function entryId(post) {
  return (
    post.legacyId ??
    `tag:nexus.js.org,${post.date.slice(0, 4)}:blog/${post.slug}`
  );
}

export function atomFeed(posts) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `<id>${SITE}/blog/</id>`,
    '<title>NexusDI Blog</title>',
    `<updated>${posts[0]?.date ?? EPOCH}T00:00:00Z</updated>`,
    `<link href="${SITE}/blog/"/>`,
    `<link rel="self" href="${SITE}/blog/atom.xml"/>`,
    ...posts.flatMap((post) => [
      '<entry>',
      `<id>${escape(entryId(post))}</id>`,
      `<title>${escape(post.title)}</title>`,
      `<link href="${SITE}/blog/${post.slug}/"/>`,
      `<updated>${post.date}T00:00:00Z</updated>`,
      `<summary>${escape(post.description ?? '')}</summary>`,
      '</entry>',
    ]),
    '</feed>',
    '',
  ].join('\n');
}

export function rssFeed(posts) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>NexusDI Blog</title>',
    `<link>${SITE}/blog/</link>`,
    '<description>Posts about NexusDI releases.</description>',
    ...posts.flatMap((post) => [
      '<item>',
      `<title>${escape(post.title)}</title>`,
      `<link>${SITE}/blog/${post.slug}/</link>`,
      `<guid isPermaLink="false">${escape(entryId(post))}</guid>`,
      `<pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>`,
      `<description>${escape(post.description ?? '')}</description>`,
      '</item>',
    ]),
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const app = join(import.meta.dirname, '..');
  const out = join(app, 'out');
  if (!existsSync(join(out, 'blog', 'index.html'))) {
    console.log('this build holds no blog, so no feed was written');
  } else {
    const posts = readPosts(join(app, 'content', 'blog'));
    mkdirSync(join(out, 'blog'), { recursive: true });
    writeFileSync(join(out, 'blog', 'atom.xml'), atomFeed(posts));
    writeFileSync(join(out, 'blog', 'rss.xml'), rssFeed(posts));
    console.log(`wrote the blog feeds with ${posts.length} posts`);
  }
}
