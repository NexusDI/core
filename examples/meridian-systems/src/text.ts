import type { ErrorText, ErrorTextPack } from '@nexusdi/core';

import type {
  BadCommandError,
  BadCommandReason,
  FtlNotSpooledError,
  InterlockError,
  PowerBudgetError,
  RelayError,
  UnknownCompartmentError,
} from './errors';

/** Every place in an integer's digits where a thousands comma goes. */
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/**
 * `value` rounded to at most `digits` decimals, with trailing zeros dropped
 * and the thousands grouped by a comma. The text is the same on every host:
 * `Intl` and `toLocaleString` follow the host's locale.
 */
export function formatNumber(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  const [whole = '', fraction = ''] = fixed.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  // toFixed keeps the sign of a negative value that rounds to zero.
  const sign = whole.startsWith('-') && Number(fixed) !== 0 ? '-' : '';
  const grouped = whole.replace('-', '').replace(THOUSANDS, ',');
  return `${sign}${grouped}${trimmed === '' ? '' : `.${trimmed}`}`;
}

/** The longest stretch of a request's compartment id the text repeats. */
const ID_SHOWN = 32;

/**
 * `id` cut to its first 32 characters, with `...` after a cut, since the id
 * comes from a request path of any length.
 */
const shownId = (id: string): string =>
  id.length > ID_SHOWN ? `${id.slice(0, ID_SHOWN)}...` : id;

/** Watts as megawatts to one decimal. */
const megawatts = (watts: number): string => formatNumber(watts / 1e6, 1);

/** Joules as gigajoules to one decimal. */
const gigajoules = (joules: number): string => formatNumber(joules / 1e9, 1);

/** The text of each MERIDIAN_BAD_COMMAND reason. */
const BAD_COMMAND: Readonly<
  Record<BadCommandReason, (error: BadCommandError) => ErrorText>
> = {
  envelope: (e) => ({
    message: `A ship command is an object with a string system and a string action. The desk serves ${e.expected}.`,
    fix: 'send { system, action, ...args } as JSON.',
  }),
  system: (e) => ({
    message: `No ship system is named '${e.system}'. The desk serves ${e.expected}.`,
    fix: 'send the command to one of the systems above.',
  }),
  action: (e) => ({
    message: `${e.system} has no action '${e.action}'. It takes ${e.expected}.`,
    fix: 'send one of the actions above with its arguments.',
  }),
  argument: (e) => ({
    message: `${e.system} ${e.action} got an argument it cannot use. It takes ${e.expected}.`,
    fix: 'send the arguments in the ranges above.',
  }),
};

/**
 * The text of the `MERIDIAN_*` codes. Register it with
 * `errors({ text: [shipText] })`, or pass it to
 * `explain(error, { text: [shipText] })`; without it those errors keep
 * core's one-line message and its link to the README.
 */
export const shipText = {
  MERIDIAN_POWER_BUDGET: (error: PowerBudgetError) => ({
    message: `The ${error.consumer} load needs ${megawatts(error.demand)} MW, and the router has ${megawatts(error.available)} MW free beside the loads above it.`,
    fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
  }),
  MERIDIAN_BAD_COMMAND: (error: BadCommandError) =>
    Object.hasOwn(BAD_COMMAND, error.reason)
      ? BAD_COMMAND[error.reason](error)
      : undefined,
  MERIDIAN_UNKNOWN_COMPARTMENT: (error: UnknownCompartmentError) => ({
    message:
      error.compartment === undefined
        ? `The request names no compartment. The deck has ${error.expected}.`
        : `No compartment is named '${shownId(error.compartment)}'. The deck has ${error.expected}.`,
    fix: 'read /compartments/<id>/atmosphere with one of the compartments above.',
  }),
  MERIDIAN_INTERLOCK: (error: InterlockError) => ({
    message: `The ${error.door} door holds ${formatNumber(error.difference, 0)} Pa of difference, above the ${formatNumber(error.limit, 0)} Pa interlock.`,
    fix: `bring both sides within ${formatNumber(error.limit, 0)} Pa of each other with a pump or a vent, then open the door.`,
  }),
  MERIDIAN_FTL_NOT_SPOOLED: (error: FtlNotSpooledError) => ({
    message: `The FTL drive holds ${gigajoules(error.charge)} GJ of the ${gigajoules(error.energy)} GJ a jump needs.`,
    fix: 'spool the drive and wait until it holds the full charge, then jump.',
  }),
  MERIDIAN_RELAY: (error: RelayError) =>
    error.reason === 'timeout'
      ? {
          message: `The subspace relay did not answer the ${error.channel} channel ${error.expected}.`,
          fix: 'check that the relay is up and reachable at relayUrl, or raise relayTimeout.',
        }
      : {
          message: `The subspace relay answered the ${error.channel} channel with a table the ship cannot read. The table must be ${error.expected}.`,
          fix: 'check what the relay serves on that channel.',
        },
} satisfies ErrorTextPack;
