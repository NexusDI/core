import type { TraceEvent } from '@acme/core';

const WEIGHT: Record<string, number> = { 'scope:create': 1 };
export const weightOf = (event: TraceEvent): number => WEIGHT[event.type] ?? 0;

export const known = (event: TraceEvent): boolean => event.type in WEIGHT;

const SLOW = ['compile', 'construct'];
export const isSlow = (event: TraceEvent): boolean => SLOW.includes(event.type);

export const SEEN = new Set<TraceEvent['type']>(['init']);

export const TALLY: Partial<Record<TraceEvent['type'], number>> = {
  compile: 0,
  run: 0,
};
