import { UnchartedStarError, type Course } from '@nexusdi/meridian-systems';

import type { IFlightLog, INavCharts } from '../ship/contracts';

import { type Refusal, refusalOf } from './refusal';

/** The status and body `GET /course/:to` answers. */
export type CourseReply =
  | {
      readonly status: 200;
      readonly body: {
        readonly course: Course;
        readonly entries: readonly string[];
      };
    }
  | { readonly status: 404; readonly body: Refusal };

/**
 * Plots the course to `to` and records the plot in the request's flight log.
 * A star the charts do not hold answers 404 with the text of
 * `UnchartedStarError`. Any other throw is a bug, and the framework answers
 * it with an empty 500.
 */
export function answerCourse(
  charts: INavCharts,
  log: IFlightLog,
  to: string,
): CourseReply {
  log.record(`plotting ${to}`);
  try {
    return {
      status: 200,
      body: { course: charts.plot(to), entries: log.entries() },
    };
  } catch (error) {
    if (!(error instanceof UnchartedStarError)) throw error;
    return { status: 404, body: refusalOf(error) };
  }
}
