import { useState } from 'react';
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
 * tick the desk gave in the answer.
 */
export function answerBand(
  answer: CommandAnswer,
  ship: ShipReading | null,
): AnswerBand {
  return bandOf(
    answer,
    answer.accepted && ship !== null && ship.tick >= answer.tick,
  );
}

function bandOf(answer: CommandAnswer, applied: boolean): AnswerBand {
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
  if (applied) {
    return {
      state: 'applied',
      tick: answer.tick,
      appliedAt: answer.tick,
      ...extras,
    };
  }
  return { state: 'queued', tick: answer.tick, ...extras };
}

/**
 * The band for a route action's `answer`, or undefined before the action
 * answers. The route action names the system, so the hook takes none. Once
 * the band reads applied it stays applied for that answer, also when the
 * stream goes offline.
 */
export function useShipCommand(
  answer: CommandAnswer | undefined,
  ship: ShipReading | null,
): AnswerBand | undefined {
  const [appliedFor, setAppliedFor] = useState<CommandAnswer | undefined>();
  if (answer === undefined) return undefined;
  const band = answerBand(answer, ship);
  if (band.state === 'applied' && appliedFor !== answer) setAppliedFor(answer);
  return appliedFor === answer ? bandOf(answer, true) : band;
}
