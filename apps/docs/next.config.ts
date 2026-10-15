import { join } from 'node:path';

import type { NextConfig } from 'next';
import nextra from 'nextra';

import { readBasePath } from './app/channel.ts';
import { mdxLoaderChain } from './tools/loader-chain.mjs';

// A plain Next config. @nx/next's `withNx` and `composePlugins` are removed,
// as in the libraries repo: Nx 24 drops them and Next transpiles workspace
// packages without them.
const withNextra = nextra({
  defaultShowCopyCode: true,
  search: {
    codeblocks: false,
  },
});

const workspaceRoot = join(import.meta.dirname, '../..');

const config = withNextra({
  // Next 16 builds with Turbopack and never calls `webpack()`, so the MDX
  // loaders are registered here. `tools/loader-chain.mjs` holds their order.
  turbopack: {
    rules: {
      '*.mdx': {
        loaders: mdxLoaderChain(workspaceRoot).map(({ loader, options }) =>
          options ? { loader, options } : loader,
        ),
      },
    },
    // Every page with a `twoslash` fence imports `Popup` from here, and
    // Nextra's ships headlessui and floating-ui with every page. The shim
    // re-exports the rest of `nextra/components` and swaps in a lazy `Popup`.
    // Nextra spreads these aliases into its own.
    resolveAlias: {
      'nextra/components': './components/twoslash/nextra-components.ts',
    },
  },
  // GitHub Pages serves static files only.
  output: 'export',
  // Next's image optimiser needs a server.
  images: { unoptimized: true },
  // `tokens/index.html`, which GitHub Pages resolves for `/tokens/`.
  trailingSlash: true,
  // `/next` for the `/next/` build and empty for the root build (spec §15.4).
  basePath: readBasePath(),
  // The behaviour catalogue fetches its sidecars under the base path, so the
  // client needs the path `basePath` set.
  env: { NEXUS_BASE_PATH: readBasePath() },
});

/**
 * Swaps `tools/mdx-nextra-loader.mjs` in for Nextra's own loader in every MDX
 * rule Nextra adds, so the Shiki transformers it appends run on every page
 * fence. Ported from `Evanion/libraries` `apps/docs/next.config.ts` at
 * 670ac27f.
 */
function withShikiTransformers(next: NextConfig): NextConfig {
  const loader = join(import.meta.dirname, 'tools/mdx-nextra-loader.mjs');
  const rules = Object.fromEntries(
    Object.entries(next.turbopack?.rules ?? {}).map(([glob, rule]) => {
      if (!glob.includes('{md,mdx}') || !rule || !('loaders' in rule))
        return [glob, rule];
      return [
        glob,
        {
          ...rule,
          loaders: (rule.loaders ?? []).map((each) =>
            typeof each === 'object' &&
            each.loader.endsWith('/nextra/loader.cjs')
              ? {
                  loader,
                  options: { ...each.options, nextraLoader: each.loader },
                }
              : each,
          ),
        },
      ];
    }),
  );
  return { ...next, turbopack: { ...next.turbopack, rules } };
}

export default withShikiTransformers(config);
