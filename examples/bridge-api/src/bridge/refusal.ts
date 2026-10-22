import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { shipText } from '@nexusdi/meridian-systems/text';

/** The body of a refused request: the error's code and its text. */
export interface Refusal {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

/** The text of `error`, from shipText or core's pack, else its one-line message. */
export function refusalOf(error: NexusError): Refusal {
  const text = explain(error, { text: [shipText] });
  return {
    code: error.code,
    message: text?.message ?? error.message.replace(`[${error.code}] `, ''),
    ...(text?.fix === undefined ? {} : { fix: text.fix }),
  };
}
