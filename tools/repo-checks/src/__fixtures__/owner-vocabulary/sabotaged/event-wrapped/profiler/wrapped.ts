import type { TraceEvent } from '@acme/core';

export const joined = (event: TraceEvent): string => [event.type].join(',');

export const json = (event: TraceEvent): string =>
  JSON.stringify({ t: event.type });

export const keyed = (event: TraceEvent): string[] =>
  Object.keys({ [event.type]: 1 });

export function held(event: TraceEvent): boolean {
  const box = { t: event.type };
  return box.t.startsWith('scope:');
}

// The check does not follow a read out of a callback's return value.
export const mapped = (events: readonly TraceEvent[]): string =>
  events.map((event) => event.type).join(',');
