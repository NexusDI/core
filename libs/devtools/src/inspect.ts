import {
  Nexus,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type CheckOptions,
  type CheckedRoot,
  type ErrorTextPack,
  type UninferredRoot,
} from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

import {
  graphOf,
  notesOf,
  type GraphAnnotator,
  type NexusGraph,
} from './graph.js';

/** inspect()'s options: Nexus.check's, plus the two that stay in devtools. */
export type InspectOptions = CheckOptions & {
  /** Text packs, ahead of core's own. An earlier pack wins for the same code. */
  readonly text?: readonly ErrorTextPack[];
  /** Annotators whose notes the graph sets on each provider, in array order. */
  readonly annotate?: readonly GraphAnnotator[];
};

/**
 * The graph Nexus.check compiles, for a CLI or a CI job. Builds nothing.
 * Takes the root forms Nexus.check takes: a module, a provider array, or
 * `{ providers, imports, exports }`. Errors carry @nexusdi/errors' text,
 * with `options.text` ahead of core's pack, and each provider carries the
 * notes of `options.annotate`. The one internal plugin takes no
 * name a caller's errors() or devtools() uses, and it goes after the caller's
 * plugins, so a caller's formatter words an error first.
 */
export function inspect<const R = UninferredRoot>(
  root: CheckedRoot<R>,
  options: InspectOptions = {},
): NexusGraph {
  const { text, annotate, ...check } = options;
  let last: BlueprintView | undefined;
  Nexus.check(root, {
    ...check,
    plugins: [
      ...(check.plugins ?? []),
      {
        name: 'nexus:inspect',
        apiVersion: NEXUS_PLUGIN_API,
        compile: { check: (view) => void (last = view) },
        formatError: (error, view) => explain(error, { view, text }),
      },
    ],
  });
  if (last === undefined)
    throw new Error('internal: Nexus.check compiled nothing');
  return graphOf(last, null, notesOf(last, annotate));
}
