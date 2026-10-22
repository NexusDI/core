import { isNexusError } from '@nexusdi/core';
import {
  BadCommandError,
  type ICommandDesk,
  type QueuedCommand,
} from '@nexusdi/meridian-systems';

import type { IFlightLog } from '../ship/contracts';
import { type Refusal, refusalOf } from './refusal';

/** The status and body `POST /commands` answers. */
export type CommandReply =
  | {
      readonly status: 202;
      readonly body: QueuedCommand & { readonly flightLog?: readonly string[] };
    }
  | { readonly status: 400 | 409; readonly body: Refusal };

/**
 * Hands `body` to the desk. A queued command answers 202 with its tick, and
 * with the entries of the request's flight log `log` when it holds any. A
 * `BadCommandError` answers 400 and any other `NexusError` 409. Any other
 * throw is a bug, and the framework answers it with an empty 500.
 */
export function answerCommand(
  desk: ICommandDesk,
  body: unknown,
  log: IFlightLog,
): CommandReply {
  try {
    const queued = desk.submit(body);
    const flightLog = log.entries();
    return {
      status: 202,
      body:
        flightLog.length === 0
          ? queued
          : { ...queued, flightLog: [...flightLog] },
    };
  } catch (error) {
    if (!isNexusError(error)) throw error;
    const status = error instanceof BadCommandError ? 400 : 409;
    return { status, body: refusalOf(error) };
  }
}
