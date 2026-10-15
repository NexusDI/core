import { join } from 'node:path';

import { referenceOptions } from './reference-options.mjs';

const tool = (name) => join(import.meta.dirname, name);

/**
 * The `*.mdx` loaders, in the order `turbopack.rules` lists them. Turbopack
 * runs the list from last to first:
 *
 * 1. the listing loader wraps a fence carrying an exemption tag in `<Listing>`;
 * 2. the diagram loader rewrites a mermaid fence into `<Diagram>`;
 * 3. the region loader fills every `file=… region=…` fence;
 * 4. the reference loader expands every `<!-- reference … -->` directive;
 * 5. the twoslash prelude gives every `twoslash` fence the site's compiler
 *    options and runtime globals.
 *
 * The prelude is the first entry, so it runs last, over every fence the
 * others wrote (spec section 22, item 5).
 *
 * @param {string} workspaceRoot
 * @returns {{ loader: string, options?: Record<string, string> }[]}
 */
export function mdxLoaderChain(workspaceRoot) {
  return [
    { loader: tool('mdx-twoslash-prelude.mjs') },
    {
      loader: '@nexusdi/doc-examples/mdx-reference-loader',
      options: { root: workspaceRoot, ...referenceOptions },
    },
    {
      loader: '@nexusdi/doc-examples/mdx-region-loader',
      options: { root: workspaceRoot },
    },
    { loader: tool('mdx-diagram-loader.mjs') },
    { loader: tool('mdx-listing-loader.mjs') },
  ];
}
