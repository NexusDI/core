import { Token } from '@nexusdi/core';

import type { FtlRating } from '../../physics/ftl';
import type { QueuedCommand } from '../../simulation/commands';

/** What the FTL drive takes, in the words a refused jump names it with. */
export const FTL_ACTIONS =
  'spool with no arguments and jump with a charted star to jump to';

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
