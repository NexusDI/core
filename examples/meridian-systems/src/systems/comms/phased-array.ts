import { optional } from '@nexusdi/core';

import { type IReactorCore, REACTOR } from '../engineering/contracts';
import type { QueuedCommand } from '../../simulation/commands';
import { NO_SUBSPACE_LINK_NOTICE } from '../../text';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';

import {
  type ICommsArray,
  type ISubspaceLink,
  SUBSPACE_LINK,
} from './contracts';

/**
 * The Meridian's phased array. The simulation models the array's traffic and
 * reads the link's presence alone: the graph decides at construction whether
 * the ship has a link, and no tick calls it. The array reads the reactor
 * because a sign-off needs power, so on dispose the array signs off while the
 * reactor still runs: core disposes a reader before what it reads.
 */
export class PhasedArray implements ICommsArray {
  static deps = [SHIP_STATE, REACTOR, optional(SUBSPACE_LINK)] as const;

  readonly linked: boolean;

  constructor(
    private readonly state: IShipState,
    private readonly reactor: IReactorCore,
    private readonly link: ISubspaceLink | undefined,
  ) {
    this.linked = link !== undefined;
  }

  /**
   * Signs off with the relay when the array has a link and the reactor still
   * powers it. A relay that is gone does not stop the disposal.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const output = this.reactor.output;
    if (this.link === undefined || !(output > 0)) return;
    try {
      await this.link.signOff({ tick: this.state.snapshot().tick, output });
    } catch {
      // The sign-off is a courtesy. The ship powers down either way.
    }
  }

  /** Queues the hail. An array with no link adds a notice that the hail waits. */
  hail(): QueuedCommand {
    const queued = this.state.queue({ comms: { hail: true } });
    return this.linked
      ? queued
      : { ...queued, notice: NO_SUBSPACE_LINK_NOTICE };
  }
}
