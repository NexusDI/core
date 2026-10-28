import { Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';

/** The name comms answers to on the command desk. */
export const COMMS_SYSTEM = 'comms';

/** The actions comms takes, in words. shipText reads it after "It takes". */
export const COMMS_ACTIONS = 'hail with no arguments';

/** What the phased array is doing at the end of a tick. */
export type CommsStatus =
  'standby' | 'no subspace link' | 'no power' | 'awaiting reply';

/** One message the array received. */
export interface CommsMessage {
  /** The tick the message arrived. */
  readonly tick: number;
  readonly from: string;
  readonly text: string;
}

/** The phased array at the end of a tick. */
export interface CommsRecord {
  readonly status: CommsStatus;
  /** The tick the array sent its last hail, or null before the first. */
  readonly sent: number | null;
  /** The newest `MESSAGES_KEPT` messages the array received, oldest first. */
  readonly messages: readonly CommsMessage[];
}

/** What the crew set for comms. */
export interface CommsSetpoints {
  /** True while a hail waits for the array to send it. */
  readonly hail: boolean;
}

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
