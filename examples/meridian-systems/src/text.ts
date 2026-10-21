import type { ErrorTextPack } from '@nexusdi/core';

import type { BadCommandError, PowerBudgetError } from './errors';

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

/** Watts as megawatts to one decimal. */
const megawatts = (watts: number): string => formatNumber(watts / 1e6, 1);

/**
 * The text of the `MERIDIAN_*` codes. Register it with
 * `errors({ text: [shipText] })`, or pass it to
 * `explain(error, { text: [shipText] })`; without it those errors keep
 * core's one-line message and its link to the README.
 */
export const shipText = {
  MERIDIAN_POWER_BUDGET: (error: PowerBudgetError) => ({
    message: `The ${error.consumer} need ${megawatts(error.demand)} MW, and the router has ${megawatts(error.available)} MW free beside the loads above them.`,
    fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
  }),
  MERIDIAN_BAD_COMMAND: (error: BadCommandError) => ({
    message: `${error.system} has no action '${error.action}'. It takes ${error.expected}.`,
    fix: 'send one of the actions above with its arguments.',
  }),
} satisfies ErrorTextPack;
