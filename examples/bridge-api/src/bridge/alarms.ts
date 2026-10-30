import type { IAlarmBoard } from '@nexusdi/meridian-systems';

/** What `GET /alarms` answers: the alarms of the last tick, in board order. */
export interface AlarmsAnswer {
  readonly alarms: readonly {
    readonly code: string;
    readonly subject: string;
    readonly acknowledged: boolean;
  }[];
}

/** Lists the board's active alarms. The route reads the narrow token alone, so it cannot acknowledge. */
export function answerAlarms(board: IAlarmBoard): AlarmsAnswer {
  return {
    alarms: board.active().map(({ code, subject, acknowledged }) => ({
      code,
      subject,
      acknowledged,
    })),
  };
}
