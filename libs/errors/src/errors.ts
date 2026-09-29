import { NEXUS_PLUGIN_API, type NexusPlugin } from '@nexusdi/core';

import { explain } from './explain.js';

/** Revision 1's messages, fix lines and near-miss suggestions, as a plugin. */
export function errors(): NexusPlugin {
  return {
    name: 'nexus:errors',
    apiVersion: NEXUS_PLUGIN_API,
    formatError: (error, view) => explain(error, view),
  };
}
