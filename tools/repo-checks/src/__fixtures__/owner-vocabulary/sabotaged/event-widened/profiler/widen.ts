import type { TraceEvent } from '@acme/core';

const label = (text: string): string => text.toUpperCase();
export const labelOf = (event: TraceEvent): string => label(event.type);

export function typeOf(event: TraceEvent): string {
  return event.type;
}

export const phaseOf = (event: TraceEvent<'compile'>): string => event.phase;

export function nameOf({ type }: TraceEvent): string {
  const text: string = type;
  return text;
}

export const cast = (event: TraceEvent) => event.type as string;

export const named = (event: TraceEvent, name: string): boolean =>
  event.type === name;
