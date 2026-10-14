import type { TraceEvent, TraceEventByType } from '@acme/core';
import type {} from '@acme/shields';

/** The compiler checks `type` against the owner's union at each call. */
export function only<K extends keyof TraceEventByType>(
  events: readonly TraceEvent[],
  type: K,
): TraceEvent<K>[] {
  return events.filter((event): event is TraceEvent<K> => event.type === type);
}

export const compiles = (events: readonly TraceEvent[]) =>
  only(events, 'compile');

export const raises = (events: readonly TraceEvent[]) =>
  only(events, '@acme/shields/raise');

export function durationOf(event: TraceEvent): number {
  switch (event.type) {
    case 'compile':
    case 'construct':
      return event.durationMs;
    default:
      return 0;
  }
}

export const isConstruct = (
  event: TraceEvent,
): event is TraceEvent<'construct'> => event.type === 'construct';

export const isLoad = (event: TraceEvent): boolean =>
  event.type === 'compile' && event.phase !== 'create';

export const isHigh = (event: TraceEvent): boolean =>
  event.type === '@acme/shields/raise' && event.level === 'high';

export function isInit({ type }: TraceEvent): boolean {
  return type === 'init';
}

export function isDispose(event: TraceEvent): boolean {
  const type = event.type;
  return type === 'dispose';
}

export type Raised = TraceEvent<'@acme/shields/raise'>;

/** A field outside the vocabulary is plain data. */
export const tokenOf = (event: TraceEvent<'construct'>): string => event.token;
