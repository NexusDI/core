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

export function opaque(event: TraceEvent): unknown {
  const value: unknown = event.type;
  return value;
}

export const loose = (event: TraceEvent) => event.type as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const checked = (event: TraceEvent) => event.type satisfies unknown;

export const text = (event: TraceEvent): string => String(event.type);
