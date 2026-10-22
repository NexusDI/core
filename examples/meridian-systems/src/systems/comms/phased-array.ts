import { optional } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';
import {
  type ICommsArray,
  type ISubspaceLink,
  SUBSPACE_LINK,
} from './contracts';

/**
 * The Meridian's phased array. The simulation models the array's traffic and
 * reads the link's presence alone: the graph decides at construction whether
 * the ship has a link, and no tick calls it.
 */
export class PhasedArray implements ICommsArray {
  static deps = [SHIP_STATE, optional(SUBSPACE_LINK)] as const;

  readonly linked: boolean;

  constructor(
    private readonly state: IShipState,
    link: ISubspaceLink | undefined,
  ) {
    this.linked = link !== undefined;
  }

  hail(): QueuedCommand {
    return this.state.queue({ comms: { hail: true } });
  }
}
