import type { Lifetime, RunKind, TraceEvent } from '@acme/core';

/** Counters keyed by the owner's union, filled from the events at run time. */
export interface Profile {
  readonly events: Map<TraceEvent['type'], number>;
  readonly tally: Partial<Record<TraceEvent['type'], number>>;
  readonly runs: Map<RunKind, number>;
  readonly lifetimes: Map<Lifetime, number>;
}

const bump = <K>(counts: Map<K, number>, key: K): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

export function record(profile: Profile, event: TraceEvent): void {
  bump(profile.events, event.type);
  profile.tally[event.type] = (profile.tally[event.type] ?? 0) + 1;
  switch (event.type) {
    case 'run':
      bump(profile.runs, event.kind);
      break;
    case 'construct':
      if (event.lifetime !== null) bump(profile.lifetimes, event.lifetime);
      break;
    default:
      break;
  }
}

export function label(kind: RunKind): string {
  switch (kind) {
    case 'create':
      return 'create()';
    default:
      return kind;
  }
}

export const isScoped = (event: TraceEvent<'construct'>): boolean =>
  event.lifetime === 'scoped';

const logger = { debug: (...args: unknown[]): unknown[] => args };

/** A rest parameter typed any[] or unknown[] takes a read as output. */
export function log(event: TraceEvent): void {
  console.log(event.type);
  logger.debug('event', event.type);
}

/** The same words in a list of the profiler's own steps, or a tooltip row. */
export const STEPS = ['compile', 'static', 'build', 'init', 'setup'];
export const row = (label: string): [string, string] => ['run', label];
