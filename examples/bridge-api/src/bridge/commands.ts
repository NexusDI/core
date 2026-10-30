import type { ICommandDesk } from '@nexusdi/meridian-systems';

import type { IFlightLog } from '../ship/contracts';
import { NOTICE_FIX } from './relay-text';
import { type RefusedReply, refusedReply } from './refusal';

/** The body of an accepted command: its tick, the notice of the system, and the request's flight log. */
export interface AcceptedBody {
  readonly tick: number;
  readonly notice?: {
    readonly code: string;
    readonly message: string;
    readonly fix?: string;
  };
  readonly flightLog?: readonly string[];
}

/** The status and body `POST /commands` answers. */
export type CommandReply =
  | {
      readonly status: 202;
      readonly body: AcceptedBody;
    }
  | RefusedReply;

/**
 * Hands `body` to the desk. A queued command answers 202 with its tick, the
 * notice of the system with its fix when it has one, and with the entries of
 * the request's flight log `log` when it holds any. A `BadCommandError`
 * answers 400 and any other `NexusError` 409. Any other throw is a bug, and
 * the framework answers it with an empty 500.
 */
export function answerCommand(
  desk: Pick<ICommandDesk, 'submit'>,
  body: unknown,
  log: IFlightLog,
): CommandReply {
  try {
    const { tick, notice } = desk.submit(body);
    const fix =
      notice !== undefined && Object.hasOwn(NOTICE_FIX, notice.code)
        ? NOTICE_FIX[notice.code]
        : undefined;
    const queued: AcceptedBody = {
      tick,
      ...(notice === undefined
        ? {}
        : { notice: fix === undefined ? notice : { ...notice, fix } }),
    };
    const flightLog = log.entries();
    return {
      status: 202,
      body:
        flightLog.length === 0
          ? queued
          : { ...queued, flightLog: [...flightLog] },
    };
  } catch (error) {
    return refusedReply(error);
  }
}
