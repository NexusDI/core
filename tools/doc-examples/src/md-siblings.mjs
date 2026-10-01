import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { filesUnder } from './files-under.mjs';
import { expandReferences } from './mdx-reference-loader.mjs';
import { expandRegions } from './mdx-region-loader.mjs';

/**
 * The `.md` sibling of every page: the page's MDX source with each region and
 * reference directive expanded, so an agent that fetches `/tokens.md` reads
 * the code a browser renders.
 *
 * The landing page is `content/index.mdx`, so its sibling is `/index.md`.
 * A page in a folder keeps its folder: `content/errors/<CODE>.mdx` becomes
 * `errors/<CODE>.md` (docs spec §3.3).
 *
 * `options` goes to `expandReferences` unchanged, so a missing `classPrefix`
 * throws the same TypeError the loader throws.
 */
export function mdSiblings(contentDir, root, options) {
  const siblings = new Map();
  for (const page of filesUnder(contentDir, (name) => name.endsWith('.mdx'))) {
    const regions = expandRegions(readFileSync(page, 'utf8'), root, page);
    const key = relative(contentDir, page)
      .split('\\')
      .join('/')
      .replace(/\.mdx$/, '.md');
    siblings.set(key, expandReferences(regions, root, page, options));
  }
  return siblings;
}
