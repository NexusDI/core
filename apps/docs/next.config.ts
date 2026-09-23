import nextra from 'nextra';

import { readBasePath } from './app/channel.ts';

// A plain Next config. @nx/next's `withNx` and `composePlugins` are removed,
// as in the libraries repo: Nx 24 drops them and Next transpiles workspace
// packages without them.
const withNextra = nextra({
  defaultShowCopyCode: true,
  search: {
    codeblocks: false,
  },
});

export default withNextra({
  // GitHub Pages serves static files only.
  output: 'export',
  // Next's image optimiser needs a server.
  images: { unoptimized: true },
  // `tokens/index.html`, which GitHub Pages resolves for `/tokens/`.
  trailingSlash: true,
  // `/next` for the `/next/` build and empty for the root build (spec §15.4).
  basePath: readBasePath(),
});
