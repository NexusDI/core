import {
  Nexus,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type CheckOptions,
  type ModuleRef,
} from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

import { graphOf, type NexusGraph } from './graph.js';

/**
 * The graph Nexus.check compiles, for a CLI or a CI job. Builds nothing.
 * Errors carry @nexusdi/errors' text. The one internal plugin takes no name
 * a caller's errors() or devtools() uses, so an app's plugin list passes
 * through unchanged.
 */
export function inspect(
  root: ModuleRef,
  options: CheckOptions = {},
): NexusGraph {
  let last: BlueprintView | undefined;
  Nexus.check(root, {
    ...options,
    plugins: [
      {
        name: 'nexus:inspect',
        apiVersion: NEXUS_PLUGIN_API,
        compile: { check: (view) => void (last = view) },
        formatError: (error, view) => explain(error, view),
      },
      ...(options.plugins ?? []),
    ],
  });
  if (last === undefined)
    throw new Error('internal: Nexus.check compiled nothing');
  return graphOf(last, null);
}
