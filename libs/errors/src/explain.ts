import type {
  BlueprintError,
  BlueprintView,
  ErrorText,
  ErrorTextKit,
  ErrorTextPack,
  NexusError,
  NexusErrorByCode,
} from '@nexusdi/core';
import { coreText, layoutText } from '@nexusdi/core/text';

import { nearMissesOf } from './near-misses.js';

/** One pack entry, called with the error of any code. */
type AnyEntry = (
  error: NexusError,
  view: BlueprintView | undefined,
  kit: ErrorTextKit,
) => ErrorText | undefined;

/** Revision 1's full message for `error`, or its own message for a code explain() does not know. */
function render(error: NexusError, view: BlueprintView | undefined): string {
  const text = explain(error, view);
  return text === undefined ? error.message : layoutText(error.code, text);
}

/** Revision 1's aggregate text, with each inner error rendered and indented. */
function blueprintText(
  error: BlueprintError,
  view: BlueprintView | undefined,
): ErrorText {
  const count = `${error.errors.length} error${error.errors.length === 1 ? '' : 's'}`;
  const lines = error.errors.map(
    (inner) => `  ${render(inner, view).split('\n').join('\n    ')}`,
  );
  return {
    message: `the module graph has ${count}; nothing was built.\n${lines.join('\n')}`,
  };
}

/** The kit a pack reads near misses through: a search of `view`, or none without one. */
function kitFor(view: BlueprintView | undefined): ErrorTextKit {
  return {
    nearMisses: (token, moduleId) =>
      view === undefined ? [] : nearMissesOf({ token, moduleId }, view),
  };
}

/**
 * Revision 1's text for any NexusError core raised, from core's text pack,
 * or undefined for a code another package owns (those carry their own
 * text). With a view, a MissingProviderError core raised also gets its
 * near misses.
 */
export function explain(
  error: NexusError,
  view?: BlueprintView,
): ErrorText | undefined {
  if (error.code === 'NEXUS_BLUEPRINT_INVALID')
    return blueprintText(error as BlueprintError, view);
  const pack: ErrorTextPack = coreText;
  if (!Object.hasOwn(pack, error.code)) return undefined;
  const entry = pack[error.code as keyof NexusErrorByCode] as
    AnyEntry | undefined;
  return entry?.(error, view, kitFor(view));
}
