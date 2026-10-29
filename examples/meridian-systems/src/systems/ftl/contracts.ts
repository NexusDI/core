import { Token } from '@nexusdi/core';

import type { ICommandHandler, QueuedCommand } from '../../simulation/commands';
import type { IShipSystem } from '../../simulation/contracts';
import type { IPowerConsumer } from '../engineering/contracts';

/** The name the FTL drive answers to on the command desk. */
export const FTL_SYSTEM = 'ftl';

/** What the FTL drive takes, in the words a refused jump names it with. */
export const FTL_ACTIONS =
  'spool with no arguments and jump with a charted star to jump to';

/** The FTL drive's fixed figures. */
export interface FtlRating {
  /** The charge a jump spends, E_spool, in J. */
  readonly energy: number;
  /** The spool's draw while it charges, in W. */
  readonly power: number;
  /** The share of a jump's charge that ends in the coolant loop as one pulse. */
  readonly pulseShare: number;
  /** The reactor level the spool needs at the start of a tick, 0 to 1. */
  readonly reactorLevel: number;
  /** The spool holds once the coolant reaches this temperature at the start of a tick, in K. */
  readonly coolantLimit: number;
}

/**
 * `offline`: no drive is loaded; the store starts the record here, and the
 * drive's first step writes another status. `idle`: unarmed and below a full
 * charge. `held`: armed with no power this tick. The spool asks no power
 * while the reactor sits under 0.9 or the coolant at 1,300 K or more, and
 * the router sheds it when its budget runs short. `spooling`: armed and
 * charging.
 * `charged`: the charge is full.
 */
export type FtlStatus = 'offline' | 'idle' | 'held' | 'spooling' | 'charged';

/** The FTL drive at the end of a tick. */
export interface FtlRecord {
  readonly status: FtlStatus;
  /** The spool's charge, in J. */
  readonly charge: number;
  /** The charted star the ship sits at, or HOME_SECTOR before the first jump. */
  readonly sector: string;
  /** The tick of the last jump, or null before the first. */
  readonly jumped: number | null;
}

/** What the crew set for the FTL drive. */
export interface FtlSetpoints {
  /** True while the spool may charge. */
  readonly armed: boolean;
  /** The star of a jump the crew commanded, or null. */
  readonly jump: string | null;
}

/** The ship's FTL drive, which a running ship adds with load(). */
export interface IFtlDrive {
  /** The drive's fixed figures, in J, W and K. */
  readonly rating: FtlRating;
  /**
   * Arms the spool for the next tick. Throws `PowerBudgetError` and queues
   * nothing when the router cannot fit the spool at the reactor's output
   * now. On an armed drive it asks the router nothing and queues nothing. It
   * then answers the next tick.
   */
  spool(): QueuedCommand;
  /**
   * Queues a jump to the charted star `to`. Throws `BadCommandError` for a
   * star the charts do not hold and `FtlNotSpooledError` below a full charge.
   */
  jump(to: string): QueuedCommand;
}

export const FTL_DRIVE = new Token<IFtlDrive>('FtlDrive');
/** The drive's step, which `JumpDrive` registers with the tick loop. `FtlDrive` keeps it private. */
export const FTL_PHYSICS = new Token<IShipSystem>('FtlPhysics');
/** The drive's load, which `JumpDrive` registers with the power router. `FtlDrive` keeps it private. */
export const FTL_POWER = new Token<IPowerConsumer>('FtlPower');
/** The drive's commands, which `JumpDrive` registers with the desk. `FtlDrive` keeps them private. */
export const FTL_COMMANDS = new Token<ICommandHandler>('FtlCommands');

/**
 * The drive's record and setpoints join the snapshot when a ship loads the
 * drive, so a ship without it holds neither key.
 */
declare module '../../simulation/contracts' {
  interface ShipRecords {
    readonly ftl?: FtlRecord;
  }
  interface ShipSetpoints {
    readonly ftl?: FtlSetpoints;
  }
}
