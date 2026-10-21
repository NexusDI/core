import { errorBase } from '@nexusdi/core';

/** The README section of each code; the one-line message ends with this url and the code. */
const DOCS =
  'https://github.com/NexusDI/core/tree/main/examples/meridian-systems#';

interface PowerBudgetFields {
  /** The load the router could not fit. */
  readonly consumer: string;
  /** The power the load asks for, in W. */
  readonly demand: number;
  /** The power left for it after the loads of higher priority, in W. */
  readonly available: number;
}

/** A command asked for a load the power router cannot fit at the reactor's current output. */
export class PowerBudgetError extends errorBase<
  'MERIDIAN_POWER_BUDGET',
  PowerBudgetFields
>('MERIDIAN_POWER_BUDGET', 'PowerBudgetError', DOCS) {}

/**
 * What the desk or the system could not read: the envelope, the system's
 * name, the action, or an argument of the action.
 */
export type BadCommandReason = 'envelope' | 'system' | 'action' | 'argument';

interface BadCommandFields {
  readonly reason: BadCommandReason;
  /** The system the command names. */
  readonly system: string;
  /** The action the command names. */
  readonly action: string;
  /** What the desk serves or the system takes, in words. */
  readonly expected: string;
}

/** A command the desk or its system cannot read: a bad envelope, an unknown system, action or argument. */
export class BadCommandError extends errorBase<
  'MERIDIAN_BAD_COMMAND',
  BadCommandFields
>('MERIDIAN_BAD_COMMAND', 'BadCommandError', DOCS) {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    MERIDIAN_POWER_BUDGET: PowerBudgetError;
    MERIDIAN_BAD_COMMAND: BadCommandError;
  }
}
