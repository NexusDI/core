import { join } from 'node:path';

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

export default withNextra({
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
  },
  // GitHub Pages serves static files only.
  output: 'export',
  // Next's image optimiser needs a server.
  images: { unoptimized: true },
  // `tokens/index.html`, which GitHub Pages resolves for `/tokens/`.
  trailingSlash: true,
  // `/next` for the `/next/` build and empty for the root build (spec §15.4).
  basePath: readBasePath(),
});
