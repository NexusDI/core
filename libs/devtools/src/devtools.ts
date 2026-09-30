import {
  NEXUS_PLUGIN_API,
  type ErrorTextPack,
  type Nexus,
  type NexusPlugin,
  type PluginContext,
  type TraceEvent,
} from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

import { DevtoolsError } from './devtools-error.js';
import {
  graphOf,
  notesOf,
  type GraphAnnotator,
  type NexusGraph,
} from './graph.js';

/** Every container any devtools() object was registered in, with that object's annotators. */
const CONTEXTS = new WeakMap<
  Nexus,
  {
    readonly context: PluginContext;
    readonly annotate: readonly GraphAnnotator[] | undefined;
  }
>();

export interface DevtoolsOptions {
  /** Receives every lifecycle event, as trace() does. */
  readonly trace?: (event: TraceEvent) => void;
  /** Text packs, ahead of core's own. An earlier pack wins for the same code. */
  readonly text?: readonly ErrorTextPack[];
  /** Annotators whose notes graph() sets on each provider, in array order. */
  readonly annotate?: readonly GraphAnnotator[];
}

/** graph(), the trace and @nexusdi/errors' messages for development. */
export function devtools(options: DevtoolsOptions = {}): NexusPlugin {
  return {
    name: 'nexus:devtools',
    apiVersion: NEXUS_PLUGIN_API,
    setup: (context) => {
      CONTEXTS.set(context.container, {
        context,
        annotate: options.annotate,
      });
    },
    ...(options.trace === undefined ? {} : { observe: options.trace }),
    formatError: (error, view) => explain(error, { view, text: options.text }),
  };
}

/** The compiled graph of a container registered with devtools(), as plain JSON. */
export function graph(ship: Nexus): NexusGraph {
  const registered = CONTEXTS.get(ship);
  if (registered === undefined)
    throw new DevtoolsError(
      { code: 'NEXUS_DEVTOOLS_UNREGISTERED', path: null },
      {
        text: "graph() reads the container through devtools(), and this container was created without it.\n  Fix: register devtools() in Nexus.create's plugins: Nexus.create(Root, { plugins: [devtools()] }).",
      },
    );
  const { context, annotate } = registered;
  const view = context.blueprint();
  return graphOf(view, (id) => context.builtAsync(id), notesOf(view, annotate));
}
