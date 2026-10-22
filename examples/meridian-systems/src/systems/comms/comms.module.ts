import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_SYSTEMS } from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';
import { CommsCommands } from './comms-commands';
import { CommsPhysics } from './comms-physics';
import { CommsPower } from './comms-power';
import { COMMS_ARRAY, COMMS_OPTIONS, SUBSPACE_LINK } from './contracts';
import { PhasedArray } from './phased-array';
import { SubspaceRelay } from './subspace-relay';

/** The array's four providers, which both modules bind. */
const ARRAY_PROVIDERS = [
  provide(COMMS_ARRAY, { useClass: PhasedArray }),
  provide(SHIP_SYSTEMS, { useClass: CommsPhysics }),
  provide(POWER_CONSUMERS, { useClass: CommsPower }),
  provide(COMMAND_HANDLERS, { useClass: CommsCommands }),
] as const;

const ARRAY_EXPORTS = [
  COMMS_ARRAY,
  SHIP_SYSTEMS,
  POWER_CONSUMERS,
  COMMAND_HANDLERS,
] as const;

/** The phased array with the subspace link to the relay `COMMS_OPTIONS` names. */
export const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [
    provide(SUBSPACE_LINK, { useClass: SubspaceRelay }),
    ...ARRAY_PROVIDERS,
  ],
  exports: [SUBSPACE_LINK, ...ARRAY_EXPORTS],
});

/**
 * The phased array with no subspace link. No module binds SUBSPACE_LINK, so
 * the array's optional() dependency resolves undefined.
 */
export const OfflineComms = defineModule({
  name: 'OfflineComms',
  providers: [...ARRAY_PROVIDERS],
  exports: [...ARRAY_EXPORTS],
});
