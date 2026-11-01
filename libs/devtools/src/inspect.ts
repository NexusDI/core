import {
  type BlueprintView,
  check,
  type CheckedRoot,
  type CheckOptions,
  type ErrorTextPack,
  NEXUS_PLUGIN_API,
  type UninferredRoot,
} from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

import {
  graphOf,
  notesOf,
  type GraphAnnotator,
  type NexusGraph,
} from './graph.js';

/** inspect()'s options: check()'s, plus the two that stay in devtools. */
export type InspectOptions = CheckOptions & {
  /** Text packs, ahead of core's own. An earlier pack wins for the same code. */
  readonly text?: readonly ErrorTextPack[];
  /** Annotators whose notes the graph sets on each provider, in array order. */
  readonly annotate?: readonly GraphAnnotator[];
};

/**
 * The graph check() compiles, for a CLI or a CI job. Builds nothing.
 * Takes the root forms check() takes: a module, a provider array, or
 * `{ providers, imports, exports }`. Errors carry @nexusdi/errors' text,
 * with `options.text` ahead of core's pack, and each provider carries the
 * notes of `options.annotate`. The one internal plugin takes no
 * name a caller's errors() or devtools() uses, and it goes after the caller's
 * plugins, so a caller's formatter words an error first. The graph's
 * `unchecked` lists the modules whose options only Nexus.create can validate,
 * from check()'s report. A schema that throws makes inspect() throw the
 * same error, unwrapped.
 */
export function inspect<const R = UninferredRoot>(
  root: CheckedRoot<R>,
  options: InspectOptions = {},
): NexusGraph {
  const { text, annotate, ...checkOptions } = options;
  let last: BlueprintView | undefined;
  const report = check(root, {
    ...checkOptions,
    plugins: [
      ...(checkOptions.plugins ?? []),
      {
        name: 'nexus:inspect',
        apiVersion: NEXUS_PLUGIN_API,
        compile: { check: (view) => void (last = view) },
        formatError: (error, view) => explain(error, { view, text }),
      },
    ],
  });
  if (last === undefined) throw new Error('internal: check() compiled nothing');
  return graphOf(last, null, notesOf(last, annotate), report.unchecked);
}
