import { isNexusError, type NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import type { Course, INavCharts } from '@nexusdi/meridian-systems/charts';
import { shipText } from '@nexusdi/meridian-systems/text';

/** The code, message and fix of a refusal, as bridge-api's routes answer it. */
export interface Refusal {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

/** The refusal `shipText` words for `error`. */
export function refusalOf(error: NexusError): Refusal {
  const text = explain(error, { text: [shipText] });
  return {
    code: error.code,
    message: text?.message ?? error.message,
    ...(text?.fix === undefined ? {} : { fix: text.fix }),
  };
}

/**
 * The course the charts plot to `to`, or `{ refused }` with the text of
 * `UnchartedStarError` for a star they do not hold. Any other error is a
 * bug, so it passes on.
 */
export function plotOrRefuse(
  charts: INavCharts,
  to: string,
): Course | { refused: string } {
  try {
    return charts.plot(to);
  } catch (error) {
    if (!isNexusError(error, 'MERIDIAN_UNCHARTED')) throw error;
    const { message, fix } = refusalOf(error);
    return { refused: fix === undefined ? message : `${message} Fix: ${fix}` };
  }
}
