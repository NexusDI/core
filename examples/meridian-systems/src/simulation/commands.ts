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
