import type { NexusPlugin, TraceEvent } from '../src/index.js';

/** A plugin whose only hook is `observe`, for tests that asserted through trace. */
export function observer(fn: (event: TraceEvent) => void): NexusPlugin {
  return { name: 'test:events', apiVersion: 1, observe: fn };
}

/** A plugin that records every event, for tests that asserted through trace. */
export function recordEvents(): {
  readonly events: TraceEvent[];
  readonly plugin: NexusPlugin;
} {
  const events: TraceEvent[] = [];
  return { events, plugin: observer((event) => void events.push(event)) };
}
