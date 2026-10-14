import type { TraceEvent } from '@acme/core';

export const isScope = (event: TraceEvent): boolean =>
  event.type.startsWith('scope:');

export const head = (event: TraceEvent): string | undefined =>
  event.type.split(':')[0];

export const scoped = (event: TraceEvent) => event.type.match(/:/);

export const hasColon = (event: TraceEvent): boolean =>
  event.type.includes(':');

export const line = (event: TraceEvent): string => `event ${event.type}`;

export const joined = (event: TraceEvent): string => 'event ' + event.type;
