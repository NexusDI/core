import { all } from '@nexusdi/core';

import { BadCommandError } from '../errors';
import {
  COMMAND_HANDLERS,
  type ICommandDesk,
  type ICommandHandler,
  type QueuedCommand,
  type ShipCommand,
} from './commands';

/** Reads the envelope of a crew command and hands the command to its system's handler. */
export class CommandDesk implements ICommandDesk {
  static deps = [all(COMMAND_HANDLERS)] as const;

  private readonly handlers = new Map<string, ICommandHandler>();
  /** The systems the desk serves, in words, for the text of a refusal. */
  private readonly serves: string;

  constructor(handlers: ICommandHandler[]) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.system)) {
        throw new Error(
          `Two command handlers serve the system '${handler.system}'.`,
        );
      }
      this.handlers.set(handler.system, handler);
    }
    // `<` compares UTF-16 code units and gives one order on every engine.
    // `localeCompare` follows the host locale.
    const names = [...this.handlers.keys()].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    this.serves = listInWords(names);
  }

  submit(body: unknown): QueuedCommand {
    if (!isShipCommand(body)) {
      throw new BadCommandError({
        reason: 'envelope',
        system: stringField(body, 'system'),
        action: stringField(body, 'action'),
        expected: this.serves,
      });
    }
    const handler = this.handlers.get(body.system);
    if (!handler) {
      throw new BadCommandError({
        reason: 'system',
        system: body.system,
        action: body.action,
        expected: this.serves,
      });
    }
    return handler.handle(body);
  }
}

function isShipCommand(body: unknown): body is ShipCommand {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).system === 'string' &&
    typeof (body as Record<string, unknown>).action === 'string'
  );
}

/** `body[key]` when `body` is an object that holds a string there, else ''. */
function stringField(body: unknown, key: 'system' | 'action'): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** `a`, `a and b`, `a, b and c`, or `no system` for an empty list. */
function listInWords(names: readonly string[]): string {
  if (names.length === 0) return 'no system';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
