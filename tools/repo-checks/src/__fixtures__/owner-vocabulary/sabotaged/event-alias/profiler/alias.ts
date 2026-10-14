import type { TraceEvent as Core } from '@acme/core';

type TraceEvent = Core;

export const isScope = (event: TraceEvent): boolean =>
  event.type.startsWith('scope:');
