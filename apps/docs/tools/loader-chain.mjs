import { join } from 'node:path';

const tool = (name) => join(import.meta.dirname, name);

/**
 * The `*.mdx` loaders, in the order `turbopack.rules` lists them. Turbopack
 * runs the list from last to first:
 *
 * 1. the listing loader wraps a fence carrying an exemption tag in `<Listing>`;
 * 2. the diagram loader rewrites a mermaid fence into `<Diagram>`;
 * 3. the region loader fills every `file=… region=…` fence;
 * 4. the reference loader expands every `<!-- reference … -->` directive.
 *
 * Phase 2 puts the twoslash prelude first, so it runs last over every fence
 * the others wrote (spec §14.2).
 *
 * @param {string} workspaceRoot
 * @returns {{ loader: string, options?: Record<string, string> }[]}
 */
export function mdxLoaderChain(workspaceRoot) {
  return [
    {
      loader: '@nexusdi/doc-examples/mdx-reference-loader',
      options: { root: workspaceRoot, classPrefix: 'nexus' },
    },
    {
      loader: '@nexusdi/doc-examples/mdx-region-loader',
      options: { root: workspaceRoot },
    },
    { loader: tool('mdx-diagram-loader.mjs') },
    { loader: tool('mdx-listing-loader.mjs') },
  ];
}
