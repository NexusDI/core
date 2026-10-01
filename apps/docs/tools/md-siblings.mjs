import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { mdSiblings } from '@nexusdi/doc-examples/md-siblings';

import { readChannel } from '../app/channel.ts';

/**
 * Writes the `.md` sibling of every page into the static export: `tokens.mdx`
 * becomes `out/tokens.md`, served at `/next/tokens.md` on the /next/ build.
 *
 * A file writer, because the optional catch-all owns every path and a route
 * handler beside it would conflict. It runs from `postbuild`, ahead of
 * Pagefind, which the docs workflow calls as its own step.
 */

const app = join(import.meta.dirname, '..');
const out = join(app, 'out');

const siblings = mdSiblings(join(app, 'content'), join(app, '../..'), {
  classPrefix: 'nexus',
});

// The `next` channel leaves the blog out (spec §6.1), and a next/blog/ file
// fails the rc artifact check.
const channel = readChannel();
let written = 0;
for (const [route, markdown] of siblings) {
  if (channel === 'next' && route.startsWith('blog/')) continue;
  const path = join(out, route);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown);
  written += 1;
}

console.log(`wrote ${written} .md siblings to apps/docs/out`);
