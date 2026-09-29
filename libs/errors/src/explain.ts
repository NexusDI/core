import type {
  BlueprintError,
  BlueprintView,
  ErrorText,
  MissingProviderError,
  NexusError,
} from '@nexusdi/core';

import { BUILDERS } from './builders.js';
import { layout } from './layout.js';
import { nearMissesOf, type MissingLookup } from './near-misses.js';

/** Revision 1's full message for `error`, or its own message for a code explain() does not know. */
function render(error: NexusError, view: BlueprintView | undefined): string {
  const text = explain(error, view);
  return text === undefined ? error.message : layout(error.code, text);
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

/**
 * Revision 1's text for any NexusError core raised, or undefined for a code
 * another package owns (those carry their own text). With a view, a
 * MissingProviderError core raised also gets its near misses. One built
 * without core's lookup keeps the near misses it carries.
 */
export function explain(
  error: NexusError,
  view?: BlueprintView,
): ErrorText | undefined {
  if (error.code === 'NEXUS_BLUEPRINT_INVALID')
    return blueprintText(error as BlueprintError, view);
  const build = BUILDERS[error.code as keyof typeof BUILDERS];
  if (build === undefined) return undefined;
  const lookup = (error as { lookup?: MissingLookup | null }).lookup;
  if (
    error.code !== 'NEXUS_MISSING_PROVIDER' ||
    view === undefined ||
    lookup === undefined ||
    lookup === null
  )
    return build(error as never, view);
  const nearMisses = nearMissesOf(lookup, view);
  return {
    ...BUILDERS.NEXUS_MISSING_PROVIDER(
      error as MissingProviderError,
      view,
      nearMisses,
    ),
    nearMisses,
  };
}
