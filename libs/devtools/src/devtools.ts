import {
  NEXUS_PLUGIN_API,
  type Nexus,
  type NexusPlugin,
  type PluginContext,
  type TraceEvent,
} from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

import { DevtoolsError } from './devtools-error.js';
import { graphOf, type NexusGraph } from './graph.js';

/** Every container any devtools() object was registered in. */
const CONTEXTS = new WeakMap<Nexus, PluginContext>();

export interface DevtoolsOptions {
  /** Receives every lifecycle event, as trace() does. */
  readonly trace?: (event: TraceEvent) => void;
}

/** graph(), the trace and @nexusdi/errors' messages for development. */
export function devtools(options: DevtoolsOptions = {}): NexusPlugin {
  return {
    name: 'nexus:devtools',
    apiVersion: NEXUS_PLUGIN_API,
    setup: (context) => {
      CONTEXTS.set(context.container, context);
    },
    ...(options.trace === undefined ? {} : { observe: options.trace }),
    formatError: (error, view) => explain(error, { view }),
  };
}

/** The compiled graph of a container registered with devtools(), as plain JSON. */
export function graph(ship: Nexus): NexusGraph {
  const context = CONTEXTS.get(ship);
  if (context === undefined)
    throw new DevtoolsError(
      {},
      {
        text: "graph() reads the container through devtools(), and this container was created without it.\n  Fix: register devtools() in Nexus.create's plugins: Nexus.create(Root, { plugins: [devtools()] }).",
      },
    );
  return graphOf(context.blueprint(), (id) => context.builtAsync(id));
}
