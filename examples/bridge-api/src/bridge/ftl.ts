import type { Scope } from '@nexusdi/core';
import {
  FTL_DRIVE,
  type FtlRating,
  type IFtlDrive,
  type QueuedCommand,
} from '@nexusdi/meridian-systems';

import { type RefusedReply, refusedReply } from './refusal';
import type { FrameRating } from './telemetry-stream';

/** The status and body `POST /ftl/spool` and `POST /ftl/jump` answer. */
export type FtlReply =
  { readonly status: 202; readonly body: QueuedCommand } | RefusedReply;

/** Runs one drive command: 202 with its tick, or the reply of its refusal. */
function answer(command: () => QueuedCommand): FtlReply {
  try {
    return { status: 202, body: command() };
  } catch (error) {
    return refusedReply(error);
  }
}

/** Arms the spool of `drive`. */
export const answerSpool = (drive: IFtlDrive): FtlReply =>
  answer(() => drive.spool());

/**
 * Jumps `drive` to the star `to` of `body`. A body with no string `to` jumps
 * to '', a star no chart holds, so the drive words the refusal.
 */
export const answerJump = (drive: IFtlDrive, body: unknown): FtlReply =>
  answer(() =>
    drive.jump(
      typeof body === 'object' &&
        body !== null &&
        'to' in body &&
        typeof body.to === 'string'
        ? body.to
        : '',
    ),
  );

/**
 * The FTL rating of each telemetry frame, read through the stream's request
 * scope `scope`: undefined while the frame's FTL record reads `offline`, and
 * from the first other status the rating of the drive bound to FTL_DRIVE.
 * The stream's scope opened before the first FTL request loaded the drive,
 * so the read calls `scope.extend()` first. Without the extend, `get` throws
 * NEXUS_LOADED_AFTER_SCOPE. The extend and the read run once, and every
 * later frame gets the same promise.
 */
export function ftlRating(scope: Pick<Scope, 'extend' | 'get'>): FrameRating {
  let rating: Promise<FtlRating> | undefined;
  return async (reading) => {
    if (rating === undefined && reading.ftl.status === 'offline')
      return undefined;
    rating ??= scope.extend().then(() => scope.get(FTL_DRIVE).rating);
    return rating;
  };
}
