import { defineModule, provide } from '@nexusdi/core';

import { SUBSPACE_LINK, SUBSPACE_LINK_OPTIONS } from './contracts';
import { SUBSPACE_LINK_OPTIONS_SCHEMA } from './subspace-link-options-schema';
import { SubspaceRelay } from './subspace-relay';

/**
 * The subspace link to the relay its options name. An app chooses at startup
 * whether the ship has a link, and several systems read it through
 * `optional(SUBSPACE_LINK)`, so the module is global. A ship that leaves it
 * out runs offline.
 */
export const SubspaceLink = defineModule({
  name: 'SubspaceLink',
  global: true,
  options: SUBSPACE_LINK_OPTIONS,
  schema: SUBSPACE_LINK_OPTIONS_SCHEMA,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
