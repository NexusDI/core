import { isNexusError } from '@nexusdi/core';
import {
  BadCommandError,
  type ICommandDesk,
  type QueuedCommand,
} from '@nexusdi/meridian-systems';

import { type Refusal, refusalOf } from './refusal';

/** The status and body `POST /commands` answers. */
export type CommandReply =
  | { readonly status: 202; readonly body: QueuedCommand }
  | { readonly status: 400 | 409; readonly body: Refusal };

/**
 * Hands `body` to the desk. A queued command answers 202 with its tick, a
 * `BadCommandError` 400 and any other `NexusError` 409. Any other throw is a
 * bug, and the framework answers it with an empty 500.
 */
export function answerCommand(desk: ICommandDesk, body: unknown): CommandReply {
  try {
    return { status: 202, body: desk.submit(body) };
  } catch (error) {
    if (!isNexusError(error)) throw error;
    const status = error instanceof BadCommandError ? 400 : 409;
    return { status, body: refusalOf(error) };
  }
}
