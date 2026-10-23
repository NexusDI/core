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

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    MERIDIAN_POWER_BUDGET: PowerBudgetError;
    MERIDIAN_BAD_COMMAND: BadCommandError;
    MERIDIAN_UNKNOWN_COMPARTMENT: UnknownCompartmentError;
    MERIDIAN_INTERLOCK: InterlockError;
    MERIDIAN_FTL_NOT_SPOOLED: FtlNotSpooledError;
  }
}
