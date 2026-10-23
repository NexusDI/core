import { BadCommandError } from '../errors';
import type { ShipCommand } from './commands';

/** Builds the error one system throws for `action`, for a bad argument unless `reason` says otherwise. */
type CommandRefusal = (
  action: string,
  reason?: 'action' | 'argument',
) => BadCommandError;

/** The refusal of `system`. Each error lists `expected`, the system's actions in words. */
export function commandRefusal(
  system: string,
  expected: string,
): CommandRefusal {
  return (action, reason = 'argument') =>
    new BadCommandError({ reason, system, action, expected });
}

/** The string argument `name` of `command`. Throws the argument refusal for any other type. */
export function textArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): string {
  const value = command[name];
  if (typeof value !== 'string') throw refuse(command.action);
  return value;
}

/** The boolean argument `name` of `command`. Throws the argument refusal for any other type. */
export function flagArgument(
  command: ShipCommand,
  name: string,
  refuse: CommandRefusal,
): boolean {
  const value = command[name];
  if (typeof value !== 'boolean') throw refuse(command.action);
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
    throw refuse(command.action);
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
