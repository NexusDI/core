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
  /** The reactor's throttle setpoint, 0 to 1. */
  readonly throttle: number;
  /** The loads that hold power ahead of the load, in the router's priority order. */
  readonly ahead: readonly string[];
  /** Whether the reactor's level is still below its throttle setpoint, so the output is still rising. */
  readonly climbing: boolean;
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

/** Whether a refused argument is absent from the command or present and unusable. */
export type BadArgumentProblem = 'missing' | 'invalid';

interface BadCommandFields {
  /** The system the command names. */
  readonly system: string;
  /** The action the command names. */
  readonly action: string;
  /** What the desk serves or the system takes, in words. */
  readonly expected: string;
}

/**
 * A refusal that names an argument has `reason: 'argument'` and both
 * `argument` and `problem`. Every other reason has neither.
 */
type BadCommandShape =
  | (BadCommandFields & {
      readonly reason: Exclude<BadCommandReason, 'argument'>;
      readonly argument?: undefined;
      readonly problem?: undefined;
    })
  | (BadCommandFields & {
      readonly reason: 'argument';
      /** The argument the system refuses; names two joined by "or" when the action needs one of them. */
      readonly argument: string;
      readonly problem: BadArgumentProblem;
    });

/** A command the desk or its system cannot read: a bad envelope, an unknown system, action or argument. */
export class BadCommandError extends errorBase<
  'MERIDIAN_BAD_COMMAND',
  BadCommandShape
>('MERIDIAN_BAD_COMMAND', 'BadCommandError', DOCS) {}

interface UnknownCompartmentFields {
  /** The compartment id the request named; absent when it named none. */
  readonly compartment?: string;
  /** The compartments of the deck, in words. */
  readonly expected: string;
}

/** A request named a compartment the deck does not have, or named none. */
export class UnknownCompartmentError extends errorBase<
  'MERIDIAN_UNKNOWN_COMPARTMENT',
  UnknownCompartmentFields
>('MERIDIAN_UNKNOWN_COMPARTMENT', 'UnknownCompartmentError', DOCS) {}

interface InterlockFields {
  /** The door the command named. */
  readonly door: string;
  /** The pressure difference across the door, in Pa, rounded. */
  readonly difference: number;
  /** The largest difference the interlock lets a door open across, in Pa. */
  readonly limit: number;
}

/** A command asked to open a door with more pressure across it than the interlock allows. */
export class InterlockError extends errorBase<
  'MERIDIAN_INTERLOCK',
  InterlockFields
>('MERIDIAN_INTERLOCK', 'InterlockError', DOCS) {}

interface FtlNotSpooledFields {
  /** The spool's charge, in J. */
  readonly charge: number;
  /** The charge a jump spends, in J. */
  readonly energy: number;
}

/** A jump was commanded before the spool held its full charge. */
export class FtlNotSpooledError extends errorBase<
  'MERIDIAN_FTL_NOT_SPOOLED',
  FtlNotSpooledFields
>('MERIDIAN_FTL_NOT_SPOOLED', 'FtlNotSpooledError', DOCS) {}

/** What the subspace relay failed to do: answer in time, or answer a table the ship can read. */
export type RelayFaultReason = 'timeout' | 'malformed';

interface RelayFields {
  /** The relay channel the ship asked for. */
  readonly channel: string;
  readonly reason: RelayFaultReason;
  /** What the ship needed, in words: the time limit, or the shape of the answer. */
  readonly expected: string;
}

/** The subspace relay gave no answer within the time limit, or answered a table the ship cannot read. */
export class RelayError extends errorBase<'MERIDIAN_RELAY', RelayFields>(
  'MERIDIAN_RELAY',
  'RelayError',
  DOCS,
) {}

interface UnchartedStarFields {
  /** The star the request named. */
  readonly star: string;
  /** The stars the charts hold, in chart order. */
  readonly charted: readonly string[];
}

/** The charts were asked to plot a star they do not hold. */
export class UnchartedStarError extends errorBase<
  'MERIDIAN_UNCHARTED',
  UnchartedStarFields
>('MERIDIAN_UNCHARTED', 'UnchartedStarError', DOCS) {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    MERIDIAN_POWER_BUDGET: PowerBudgetError;
    MERIDIAN_BAD_COMMAND: BadCommandError;
    MERIDIAN_UNKNOWN_COMPARTMENT: UnknownCompartmentError;
    MERIDIAN_INTERLOCK: InterlockError;
    MERIDIAN_FTL_NOT_SPOOLED: FtlNotSpooledError;
    MERIDIAN_RELAY: RelayError;
    MERIDIAN_UNCHARTED: UnchartedStarError;
  }
}
