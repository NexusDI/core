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

  constructor(handlers: ICommandHandler[]) {
    for (const handler of handlers) this.register(handler);
  }

  submit(body: unknown): QueuedCommand {
    if (!isShipCommand(body)) {
      throw new BadCommandError({
        reason: 'envelope',
        system: stringField(body, 'system'),
        action: stringField(body, 'action'),
        expected: this.serves(),
      });
    }
    const handler = this.handlers.get(body.system);
    if (!handler) {
      throw new BadCommandError({
        reason: 'system',
        system: body.system,
        action: body.action,
        expected: this.serves(),
      });
    }
    return handler.handle(body);
  }

  /**
   * The unregister removes `handler` only while it still serves its system,
   * so a stale unregister leaves a later handler of that system in place.
   */
  register(handler: ICommandHandler): () => void {
    if (this.handlers.has(handler.system)) {
      throw new Error(
        `Two command handlers serve the system '${handler.system}'.`,
      );
    }
    this.handlers.set(handler.system, handler);
    return () => {
      if (this.handlers.get(handler.system) === handler) {
        this.handlers.delete(handler.system);
      }
    };
  }

  /** The systems the desk serves now, in words, for the text of a refusal. */
  private serves(): string {
    const names = [...this.handlers.keys()].sort(byCodeUnit);
    return names.length === 0 ? 'no system' : listInWords(names);
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
