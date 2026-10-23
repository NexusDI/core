import { Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';

/** The actions comms takes, in words. shipText reads it after "It takes". */
export const COMMS_ACTIONS = 'hail with no arguments';

/** A channel to the fleet's subspace relay. */
export interface ISubspaceLink {
  /** Downloads the relay's `channel` and answers its JSON body. */
  receive<T>(channel: string): Promise<T>;
}

/** The relay the subspace link calls and the frequency it asks for. */
export interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay';
  /** The relay's base URL. The link resolves each channel against it. */
  readonly relayUrl: string;
  /** How long the link waits for the relay's answer, in ms. Defaults to `DEFAULT_RELAY_TIMEOUT`. */
  readonly relayTimeout?: number;
}

/** The wait for a relay's answer when `CommsOptions` sets none, in ms. */
export const DEFAULT_RELAY_TIMEOUT = 5_000;

/** The phased array's panel. */
export interface ICommsArray {
  /** True when the ship's graph binds SUBSPACE_LINK. */
  readonly linked: boolean;
  /**
   * Queues a hail of fleet traffic control. The array sends it on the first
   * tick it has the link and the power and no reply outstanding.
   */
  hail(): QueuedCommand;
}

export const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
export const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
export const COMMS_ARRAY = new Token<ICommsArray>('CommsArray');
