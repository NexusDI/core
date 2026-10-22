import { MultiToken, Token } from '@nexusdi/core';
import type { LifeSupportSetpoints } from '../physics/atmosphere';
import type { CompartmentId } from './contracts';

/** What the crew asks of each system. A system steps toward its setpoint each tick. */
export interface Setpoints {
  readonly reactor: {
    /** The reactor level the crew asks for, 0 to 1. */
    readonly throttle: number;
  };
  readonly shields: { readonly raised: boolean };
  readonly lifeSupport: LifeSupportSetpoints<CompartmentId>;
}

/**
 * `T` with every field optional at every level of plain objects. An array or
 * a primitive stays whole, since a merge replaces it.
 */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { readonly [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** The setpoints one command changes. `SHIP_STATE` merges it over the current ones, level by level. */
export type SetpointChange = DeepPartial<Setpoints>;

/** The answer to a queued command. */
export interface QueuedCommand {
  /** The tick that applies the change. */
  readonly tick: number;
}

/** One entry of the command log. */
export interface LoggedChange {
  /** The tick that applied the change. */
  readonly tick: number;
  readonly change: SetpointChange;
}

/** A crew command. `system` and `action` name its target, and the other fields hold the action's arguments. */
export interface ShipCommand {
  readonly system: string;
  readonly action: string;
  readonly [arg: string]: unknown;
}

/** One system's commands. handle() throws a NexusError to refuse a command; any other throw is a bug. */
export interface ICommandHandler {
  /** The name a command gives in `system`, unique across the ship. */
  readonly system: string;
  handle(command: ShipCommand): QueuedCommand;
}

export interface ICommandDesk {
  /**
   * Checks the envelope of `body` and hands it to the handler of its system.
   * Throws `BadCommandError` for a bad envelope or an unknown system.
   */
  submit(body: unknown): QueuedCommand;
}

export const COMMAND_HANDLERS = new MultiToken<ICommandHandler>(
  'CommandHandlers',
);
export const COMMAND_DESK = new Token<ICommandDesk>('CommandDesk');
