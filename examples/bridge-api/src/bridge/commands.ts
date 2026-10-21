import { isNexusError, type NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import {
  BadCommandError,
  type ICommandDesk,
  type QueuedCommand,
} from '@nexusdi/meridian-systems';
import { shipText } from '@nexusdi/meridian-systems/text';

/** The body of a refused command: the error's code and its text. */
export interface CommandRefusal {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

/** The status and body `POST /commands` answers. */
export type CommandAnswer =
  | { readonly status: 202; readonly body: QueuedCommand }
  | { readonly status: 400 | 409; readonly body: CommandRefusal };

/** The text of `error`, from shipText or core's pack, else its one-line message. */
function refusalOf(error: NexusError): CommandRefusal {
  const text = explain(error, { text: [shipText] });
  return {
    code: error.code,
    message: text?.message ?? error.message.replace(`[${error.code}] `, ''),
    ...(text?.fix === undefined ? {} : { fix: text.fix }),
  };
}

/**
 * Hands `body` to the desk. A queued command answers 202 with its tick, a
 * `BadCommandError` 400 and any other `NexusError` 409. Any other throw is a
 * bug, and the framework answers it with an empty 500.
 */
export function answerCommand(
  desk: ICommandDesk,
  body: unknown,
): CommandAnswer {
  try {
    return { status: 202, body: desk.submit(body) };
  } catch (error) {
    if (!isNexusError(error)) throw error;
    const status = error instanceof BadCommandError ? 400 : 409;
    return { status, body: refusalOf(error) };
  }
}
