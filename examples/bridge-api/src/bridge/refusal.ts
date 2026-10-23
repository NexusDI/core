import { isNexusError, type NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { interceptorsText } from '@nexusdi/interceptors/text';
import { BadCommandError } from '@nexusdi/meridian-systems';
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

/** The status and body of a refused command. */
export interface RefusedReply {
  readonly status: 400 | 409;
  readonly body: Refusal;
}

/**
 * The answer to a command the ship refused: 400 for a `BadCommandError` and
 * 409 for any other `NexusError`. Any other throw is a bug, so the function
 * throws it again and the framework answers it with an empty 500.
 */
export function refusedReply(error: unknown): RefusedReply {
  if (!isNexusError(error)) throw error;
  const status = error instanceof BadCommandError ? 400 : 409;
  return { status, body: refusalOf(error) };
}
