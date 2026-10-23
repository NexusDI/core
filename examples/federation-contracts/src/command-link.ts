/** A crew command, as bridge-api's POST /commands reads it. */
export interface StationCommand {
  readonly system: string;
  readonly action: string;
  readonly [arg: string]: unknown;
}

/** The answer to a command, worded by the shell. send() never rejects. */
export type CommandReceipt =
  | { readonly queued: true; readonly tick: number; readonly text: string }
  | { readonly queued: false; readonly text: string };

/** The shell's link to bridge-api's commands route. */
export interface ICommandLink {
  send(command: StationCommand): Promise<CommandReceipt>;
}
