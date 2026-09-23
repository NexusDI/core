import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The newest RC post the 0.3 site should announce, read from the blog
 * directory the snapshot build uses. Plain ESM so the Docusaurus overlay
 * config imports it in the 0.3 site and the docs app's tests import it here.
 */
const DATED = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.mdx?$/;

function frontmatter(source) {
  const block = /^---\n([\s\S]*?)\n---/.exec(source);
  const fields = {};
  if (!block) return fields;
  for (const line of block[1].split('\n')) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

function tagsOf(value = '') {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function newestPublishedPost(dir) {
  const posts = readdirSync(dir)
    .map((file) => ({ file, match: DATED.exec(file) }))
    .filter(({ match }) => match !== null)
    .filter(({ file }) => {
      const fields = frontmatter(readFileSync(join(dir, file), 'utf8'));
      return (
        fields.draft !== 'true' &&
        tagsOf(fields.tags).includes('release-candidate')
      );
    })
    .sort((a, b) => b.file.localeCompare(a.file));

  const newest = posts[0];
  if (!newest) return null;
  const [, year, month, day, name] = newest.match;
  return {
    file: newest.file,
    permalink: `/blog/${year}/${month}/${day}/${name}`,
  };
}

export function announcementBar(post) {
  if (!post) return undefined;
  return {
    id: `rc-${post.file.replace(/\.mdx?$/, '')}`,
    isCloseable: true,
    content:
      `NexusDI 0.4 is in release candidate. Read the <a href="${post.permalink}">announcement</a>, ` +
      'or the <a href="/next/upgrade/">upgrade guide</a>.',
  };
}
