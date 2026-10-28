import {
  meridianRemote,
  type RemoteOptions,
} from '@nexusdi/federation-contracts/rspack';
import { meridianShared } from '@nexusdi/federation-contracts/shared';

import { cartographyRemote } from './rspack.config';

/**
 * The unshared build: it bundles its own copy of
 * @nexusdi/core, so its Cartography module comes from another copy and the
 * shell's load() fails with NEXUS_CORE_NOT_SHARED.
 */
export const unsharedBuild: RemoteOptions = {
  ...cartographyRemote,
  out: 'unshared',
  shared: meridianShared({ core: false }),
};

export default meridianRemote(unsharedBuild);
