import { all } from '@nexusdi/core';

import { BadCommandError } from '../errors';
import { byCodeUnit } from './by-code-unit';
import {
  COMMAND_HANDLERS,
  type ICommandDesk,
  type ICommandHandler,
  type QueuedCommand,
  type ShipCommand,
} from './commands';
import { listInWords } from './list-in-words';

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
    const names = [...this.handlers.keys()].sort(byCodeUnit);
    this.serves = names.length === 0 ? 'no system' : listInWords(names);
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
