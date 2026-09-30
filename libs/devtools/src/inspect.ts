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

import { graphOf, type NexusGraph } from './graph.js';

/**
 * The graph Nexus.check compiles, for a CLI or a CI job. Builds nothing.
 * Takes the root forms Nexus.check takes: a module, a provider array, or
 * `{ providers, imports, exports }`. Errors carry @nexusdi/errors' text,
 * with `options.text` ahead of core's pack. The one internal plugin takes no
 * name a caller's errors() or devtools() uses, and it goes after the caller's
 * plugins, so a caller's formatter words an error first.
 */
export function inspect<const R = UninferredRoot>(
  root: CheckedRoot<R>,
  options: CheckOptions & {
    /** Text packs, ahead of core's own. An earlier pack wins for the same code. */
    readonly text?: readonly ErrorTextPack[];
  } = {},
): NexusGraph {
  const { text, ...check } = options;
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
  return graphOf(last, null);
}
