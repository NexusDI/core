import type { Scope } from '@nexusdi/core';
import {
  FTL_DRIVE,
  type FtlRating,
  type IFtlDrive,
} from '@nexusdi/meridian-systems';

import type { FrameRating } from './telemetry-stream';

/** The body `POST /sections/ftl` answers once the drive has loaded. */
export interface FtlSectionReply {
  readonly rating: FtlRating;
}

/**
 * The answer of `POST /sections/ftl`: the rating of the drive bound to
 * FTL_DRIVE. From then on the desk serves `ftl` on `POST /commands`.
 */
export const answerFtlSection = (drive: IFtlDrive): FtlSectionReply => ({
  rating: drive.rating,
});

/**
 * The FTL rating of each telemetry frame, read through the stream's request
 * scope `scope`: undefined while the frame holds no FTL record or the record
 * reads `offline`, and from the first other status the rating of the drive bound to FTL_DRIVE.
 * The stream's scope opened before the first FTL request loaded the drive,
 * so the read calls `scope.extend()` first. Without the extend, `get` throws
 * NEXUS_LOADED_AFTER_SCOPE. The extend and the read run once, and every
 * later frame gets the same promise.
 */
export function ftlRating(scope: Pick<Scope, 'extend' | 'get'>): FrameRating {
  let rating: Promise<FtlRating> | undefined;
  return async (reading) => {
    const status = reading.ftl?.status ?? 'offline';
    if (rating === undefined && status === 'offline') return undefined;
    rating ??= scope.extend().then(() => scope.get(FTL_DRIVE).rating);
    return rating;
  };
}
