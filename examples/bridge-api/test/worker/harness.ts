import type { NexusPlugin, TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

/** A trace plugin and the scope events it saw, in order. */
export function recorder(): {
  plugin: NexusPlugin;
  events: TraceEvent[];
  count(type: TraceEvent['type']): number;
} {
  const events: TraceEvent[] = [];
  return {
    plugin: trace((event) => {
      if (event.type.startsWith('scope:')) events.push(event);
    }),
    events,
    count: (type) => events.filter((event) => event.type === type).length,
  };
}

/** Waits until `check` holds, polling the microtask and timer queues. */
export async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
