import { useMemo } from 'react';
import type { ShipReading } from '@nexusdi/meridian-systems';

import type { CommandAnswer } from '../di/contracts';

type Notice = {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
};

/** What a command's answer shows: queued, applied at a tick, or refused. */
export type AnswerBand =
  | {
      readonly state: 'queued';
      readonly tick: number;
      readonly flightLog?: readonly string[];
      readonly notice?: Notice;
    }
  | {
      readonly state: 'applied';
      readonly tick: number;
      readonly appliedAt: number;
      readonly flightLog?: readonly string[];
      readonly notice?: Notice;
    }
  | {
      readonly state: 'refused';
      readonly code: string;
      readonly message: string;
      readonly fix?: string;
    };

/**
 * The band for `answer` against the latest `ship` reading. An accepted
 * command is queued until a reading reaches its tick, then applied at the
 * tick of that reading.
 */
export function answerBand(
  answer: CommandAnswer,
  ship: ShipReading | null,
): AnswerBand {
  if (!answer.accepted) {
    return {
      state: 'refused',
      code: answer.code,
      message: answer.message,
      ...(answer.fix === undefined ? {} : { fix: answer.fix }),
    };
  }
  const extras = {
    ...(answer.flightLog === undefined ? {} : { flightLog: answer.flightLog }),
    ...(answer.notice === undefined ? {} : { notice: answer.notice }),
  };
  if (ship !== null && ship.tick >= answer.tick) {
    return {
      state: 'applied',
      tick: answer.tick,
      appliedAt: ship.tick,
      ...extras,
    };
  }
  return { state: 'queued', tick: answer.tick, ...extras };
}

/**
 * The band for a route action's `answer`, or undefined before the action
 * answers. The route action names the system, so the hook takes none.
 */
export function useShipCommand(
  answer: CommandAnswer | undefined,
  ship: ShipReading | null,
): AnswerBand | undefined {
  return useMemo(
    () => (answer === undefined ? undefined : answerBand(answer, ship)),
    [answer, ship],
  );
}
