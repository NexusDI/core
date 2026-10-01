import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { preamblePath, readPreamble, withPreamble } from './preamble.mjs';
import { readRegion } from './regions.mjs';

/**
 * Fills empty code blocks in the docs app's MDX from named regions in the
 * packages' READMEs, during `next build`.
 *
 *     ```ts file=libs/urn/README.md region=basic-usage
 *     ```
 *
 * Paths are workspace-root relative, which survives a page being moved
 * between directories — a docs page's own depth is not something an example
 * reference should depend on.
 *
 * Whatever else the info string carries is kept and handed to Shiki, so a
 * region block can also be a Twoslash block:
 *
 *     ```ts twoslash file=libs/acl/README.md region=quick-start
 *     ```
 *
 * Nextra injects the `Popup` component only for a fence whose meta is exactly
 * `twoslash` (nextra/dist/server/rehype-plugins/rehype-twoslash-popup.js).
 * This strips `file=` and `region=` before Nextra reads the info string, so
 * the fence above arrives there as plain `twoslash` and its hovers work. Any
 * word this does not consume survives, blocks the import, and makes the page
 * throw on a `Popup` it never imported — so `twoslash` is the only other meta
 * a region block may carry.
 *
 * A Twoslash block gets the README's own preamble in front of it, behind a
 * `// ---cut---` the reader never sees. `preamble.mjs` carries why.
 *
 * A webpack loader rather than the remark plugin the demo-apps spec called
 * for. Nextra hands `mdxOptions.remarkPlugins` straight to unified, which
 * requires plugin *functions*, while Next 16 requires every loader option to
 * be serializable and rejects a config carrying one. A loader is the only
 * position that satisfies both: its module path and its `{ root }` option are
 * both strings, and it still runs inside `next build`, so no npm lifecycle
 * hook is needed. It is ordered before Nextra's own loader, so what Nextra
 * compiles already has the regions in it.
 *
 * Not `remark-code-import`: last published 2023-05-06, still on
 * `unist-util-visit@^4` against this repo's MDX 3 / unified 11 stack, and it
 * addresses snippets by line range. Line numbers drift silently when the
 * source file is edited above them, which is the failure this exists to
 * remove.
 *
 * A missing file or region throws, so `next build` fails rather than deploying a
 * page with an empty code block where an example should be.
 */

const REFERENCE = /(?:^|\s)file=(\S+)\s+region=([\w-]+)/;

/**
 * Expands every region reference in an MDX source.
 *
 * Textual rather than AST-based: a reference lives in a fence info string, and
 * the replacement is the fence's body, so parsing the document buys nothing
 * that the fence scan does not already give.
 */
export function expandRegions(source, root, file) {
  const out = [];
  let fence = null;
  // Set while inside a block whose body came from a region, so the author's
  // own placeholder lines are dropped rather than appended to it.
  let replacing = false;

  for (const line of source.split('\n')) {
    const marker = line.match(/^(\s*)(`{3,})(.*)$/);
    const opening = marker && fence === null;
    const closing = marker && fence !== null && marker[2].startsWith(fence);

    if (opening) {
      const [, indent, ticks, info] = marker;
      const reference = info.match(REFERENCE);
      fence = ticks;
      replacing = Boolean(reference);

      if (!reference) {
        out.push(line);
        continue;
      }

      const [, path, name] = reference;
      let contents;
      try {
        contents = readFileSync(join(root, path), 'utf8');
      } catch {
        throw new Error(
          `${file}: cannot read '${path}', referenced by region '${name}'`,
        );
      }

      const region = readRegion(contents, path, name);
      // The reference is the only part consumed here; the language and any
      // meta around it belong to Shiki. A block that names neither takes the
      // language the region's own fence carried.
      const rest = info.replace(REFERENCE, '').trim();
      const emitted = rest || region.lang || 'ts';

      // Only a Twoslash fence, which a compiler reads and `// ---cut---` trims
      // back to the region. A plain fence is displayed source, and an import
      // line in front of it shows the reader something the README does not.
      const code = /\btwoslash\b/.test(emitted)
        ? withPreamble(readPreamble(dirname(join(root, path))), region.code)
        : region.code;

      out.push(`${indent}${ticks}${emitted}`);
      for (const body of code.split('\n')) out.push(indent + body);
      continue;
    }

    if (closing) {
      fence = null;
      replacing = false;
      out.push(line);
      continue;
    }

    if (!replacing) out.push(line);
  }

  return out.join('\n');
}

/**
 * The loader entry point, configured in apps/docs/next.config.ts under
 * `turbopack.rules`. `root` is the workspace root every reference resolves from.
 */
export default function mdxRegionLoader(source) {
  const { root } = this.getOptions();

  // Declares each referenced README as an input of this page, so editing one
  // rebuilds the pages that quote it. Without this the page's own mtime is the
  // only thing the build watches, and a page keeps serving a stale region.
  // The preamble beside each README is declared too, so editing one rebuilds
  // the Twoslash fences compiling against it.
  for (const match of source.matchAll(new RegExp(REFERENCE, 'g'))) {
    const readme = join(root, match[1]);
    this.addDependency(readme);
    this.addDependency(preamblePath(dirname(readme)));
  }

  return expandRegions(source, root, this.resourcePath);
}
