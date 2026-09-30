import {
  NEXUS_PLUGIN_API,
  type ErrorTextPack,
  type NexusPlugin,
} from '@nexusdi/core';

import { explain } from './explain.js';

/** What errors() takes. */
export interface ErrorsOptions {
  /** Text packs, ahead of core's own. An earlier pack wins for the same code. */
  readonly text?: readonly ErrorTextPack[];
}

/** Full messages, fix lines and near-miss suggestions for every code a pack covers, as a plugin. */
export function errors(options?: ErrorsOptions): NexusPlugin {
  const text = options?.text;
  return {
    name: 'nexus:errors',
    apiVersion: NEXUS_PLUGIN_API,
    formatError: (error, view) => explain(error, { view, text }),
  };
}
