import {
  NEXUS_PLUGIN_API,
  type NexusPlugin,
  type TraceEvent,
} from '@nexusdi/core';

/** A plugin whose only hook hands every lifecycle event to `fn`. */
export function trace(fn: (event: TraceEvent) => void): NexusPlugin {
  return { name: 'nexus:trace', apiVersion: NEXUS_PLUGIN_API, observe: fn };
}
