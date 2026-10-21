import { meridianShared } from '@nexusdi/federation-contracts/shared';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cartography, type CartographyBuild } from './rspack.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The drift build (demo apps spec 7.6): the contracts package reads its
 * version from drift/version.ts, one minor above the shell's, so the
 * shell's load() fails with NEXUS_CONTRACT_VERSION.
 */
export const driftBuild: CartographyBuild = {
  out: 'drift',
  shared: meridianShared(),
  contractAliases: {
    '@nexusdi/federation-contracts/version': path.resolve(
      __dirname,
      'drift/version.ts',
    ),
  },
};

export default cartography(driftBuild);
