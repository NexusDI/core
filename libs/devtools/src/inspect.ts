import {
  Nexus,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type CheckOptions,
  type ModuleRef,
} from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

import { graphOf, type NexusGraph } from './graph.js';

/** The graph Nexus.check compiles, for a CLI or a CI job. Builds nothing. */
export function inspect(
  root: ModuleRef,
  options: CheckOptions = {},
): NexusGraph {
  let last: BlueprintView | undefined;
  Nexus.check(root, {
    ...options,
    plugins: [
      errors(),
      {
        name: 'nexus:inspect',
        apiVersion: NEXUS_PLUGIN_API,
        compile: { check: (view) => void (last = view) },
      },
      ...(options.plugins ?? []),
    ],
  });
  if (last === undefined)
    throw new Error('internal: Nexus.check compiled nothing');
  return graphOf(last, null);
}
