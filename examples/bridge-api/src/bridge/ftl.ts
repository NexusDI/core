import type { IFtlDrive, QueuedCommand } from '@nexusdi/meridian-systems';

import { type RefusedReply, refusedReply } from './refusal';

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
