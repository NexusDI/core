import { MultiToken, Token } from '@nexusdi/core';

/** What the crew asks of each system. A system steps toward its setpoint each tick. */
export interface Setpoints {
  readonly reactor: {
    /** The reactor level the crew asks for, 0 to 1. */
    readonly throttle: number;
  };
  readonly shields: { readonly raised: boolean };
}

/** The setpoints one command changes. `SHIP_STATE` merges it over the current ones. */
export type SetpointChange = {
  readonly [K in keyof Setpoints]?: Partial<Setpoints[K]>;
};

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
