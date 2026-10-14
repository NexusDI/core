import type { TraceEvent } from '@acme/core';

export const isScope = (event: TraceEvent): boolean =>
  /^scope:/.test(event.type);

const PHASE = /^(load|check)$/;
export const phaseMatch = (event: TraceEvent<'compile'>) =>
  PHASE.exec(event.phase);
