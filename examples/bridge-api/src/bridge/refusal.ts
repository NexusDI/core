import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { interceptorsText } from '@nexusdi/interceptors/text';
import { shipText } from '@nexusdi/meridian-systems/text';

/**
 * The text packs a refusal reads, and the ones `errors()` registers in
 * development: the ship's errors and the interceptors' errors.
 */
export const SHIP_TEXT = [shipText, interceptorsText] as const;

/** The body of a refused request: the error's code and its text. */
export interface Refusal {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

/** The text of `error`, from SHIP_TEXT or core's pack, else its one-line message. */
export function refusalOf(error: NexusError): Refusal {
  const text = explain(error, { text: SHIP_TEXT });
  return {
    code: error.code,
    message: text?.message ?? error.message.replace(`[${error.code}] `, ''),
    ...(text?.fix === undefined ? {} : { fix: text.fix }),
  };
}
