import {
  meridianRemote,
  type RemoteOptions,
} from '@nexusdi/federation-contracts/rspack';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cartographyRemote } from './rspack.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The drift build: the contracts package reads its
 * version from drift/version.ts, one minor above the shell's, so the
 * shell's load() fails with NEXUS_CONTRACT_VERSION.
 */
export const driftBuild: RemoteOptions = {
  ...cartographyRemote,
  out: 'drift',
  contractAliases: {
    '@nexusdi/federation-contracts/version': path.resolve(
      __dirname,
      'drift/version.ts',
    ),
  },
};

export default meridianRemote(driftBuild);
