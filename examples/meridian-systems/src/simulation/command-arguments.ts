import { BadCommandError } from '../errors';

import type { ShipCommand } from './commands';

/**
 * Builds the error one system throws for `action`. `'action'` refuses an
 * action the system does not take. `{ argument }` refuses the argument of
 * that name as unusable, or as missing when `missing` is true. The name may
 * be two names joined by "or" when the action needs one of them.
 */
export type CommandRefusal = (
  action: string,
  reason: 'action' | { readonly argument: string; readonly missing?: true },
) => BadCommandError;

/** The refusal of `system`. Each error lists `expected`, the system's actions in words. */
export function commandRefusal(
  system: string,
  expected: string,
): CommandRefusal {
  return (action, reason) =>
    reason === 'action'
      ? new BadCommandError({ reason, system, action, expected })
      : new BadCommandError({
          reason: 'argument',
          system,
          action,
          argument: reason.argument,
          problem: reason.missing ? 'missing' : 'invalid',
          expected,
        });
}

/** The argument refusal for `name`: missing when `command` has no such field. */
function refusedArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): BadCommandError {
  return command[name] === undefined
    ? refuse(command.action, { argument: name, missing: true })
    : refuse(command.action, { argument: name });
}

/** The string argument `name` of `command`. Throws the argument refusal for any other type. */
export function textArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): string {
  const value = command[name];
  if (typeof value !== 'string') throw refusedArgument(command, name, refuse);
  return value;
}

/** The boolean argument `name` of `command`. Throws the argument refusal for any other type. */
export function flagArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): boolean {
  const value = command[name];
  if (typeof value !== 'boolean') throw refusedArgument(command, name, refuse);
  return value;
}

/**
 * The number argument `name` of `command`, from `low` to `high` with both
 * ends allowed. Throws the argument refusal for any other value, NaN included.
 */
export function numberArgument(
  command: ShipCommand,
  name: string,
  low: number,
  high: number,
  refuse: CommandRefusal,
): number {
  const value = command[name];
  if (typeof value !== 'number' || !(value >= low && value <= high)) {
    throw refusedArgument(command, name, refuse);
  }
  return value;
}

/**
 * The level argument `name` of `command`, a number from 0 to 1. Throws the
 * argument refusal for any other value, NaN included.
 */
export function levelArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): number {
  return numberArgument(command, name, 0, 1, refuse);
}

/**
 * The number argument `name` of `command`, from `low` to `high` with both ends
 * allowed, or undefined when the command has no such field. Throws the
 * argument refusal for any other value, NaN included.
 */
export function optionalNumberArgument(
  command: ShipCommand,
  name: string,
  low: number,
  high: number,
  refuse: CommandRefusal,
): number | undefined {
  if (command[name] === undefined) return undefined;
  return numberArgument(command, name, low, high, refuse);
}

/**
 * The boolean argument `name` of `command`, or undefined when the command has
 * no such field. Throws the argument refusal for any other type.
 */
export function optionalFlagArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): boolean | undefined {
  if (command[name] === undefined) return undefined;
  return flagArgument(command, name, refuse);
}

/** The argument `name` of `command` when it is one of `choices`. Throws the argument refusal otherwise. */
export function choiceArgument<const T extends string>(
  command: ShipCommand,
  name: string,
  choices: readonly T[],
  refuse: CommandRefusal,
): T {
  const value = command[name];
  const choice = choices.find((candidate) => candidate === value);
  if (choice === undefined) throw refusedArgument(command, name, refuse);
  return choice;
}

/**
 * True when `record` holds `key` itself, and then `key` is one of the keys
 * of its type. A name that `Object.prototype` holds, such as `toString` or
 * `__proto__`, is no key of a record that came off the wire.
 */
export function ownKey<T extends object>(
  record: T,
  key: string,
): key is Extract<keyof T, string> {
  return Object.hasOwn(record, key);
}
