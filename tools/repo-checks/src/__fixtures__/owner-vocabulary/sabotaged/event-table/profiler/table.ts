import type { TraceEvent } from '@acme/core';

const WEIGHT: Record<string, number> = { compile: 2, construct: 1 };
export const weightOf = (event: TraceEvent): number => WEIGHT[event.type] ?? 0;

export const known = (event: TraceEvent): boolean => event.type in WEIGHT;

const SLOW = ['compile', 'construct'];
export const isSlow = (event: TraceEvent): boolean => SLOW.includes(event.type);

const SEEN = new Set<TraceEvent['type']>(['init']);
export const seen = (event: TraceEvent): boolean => SEEN.has(event.type);

const COUNT = new Map<TraceEvent['type'], number>();
export function count(event: TraceEvent): void {
  const type = event.type;
  COUNT.set(type, (COUNT.get(type) ?? 0) + 1);
}
