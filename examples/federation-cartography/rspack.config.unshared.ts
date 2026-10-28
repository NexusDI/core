import { meridianShared } from '@nexusdi/federation-contracts/shared';

import { cartography, type CartographyBuild } from './rspack.config';

/**
 * The unshared build: it bundles its own copy of
 * @nexusdi/core, so its Cartography module comes from another copy and the
 * shell's load() fails with NEXUS_CORE_NOT_SHARED.
 */
export const unsharedBuild: CartographyBuild = {
  out: 'unshared',
  shared: meridianShared({ core: false }),
};

export default cartography(unsharedBuild);
