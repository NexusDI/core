import type { TraceEvent } from '@acme/core';

export function durationOf(event: TraceEvent): number {
  switch (event.type) {
    case 'compile':
    case 'construct':
      return event.durationMs;
  }
  return 0;
}

export function phaseOf(event: TraceEvent<'compile'>): number {
  switch (event.phase) {
    case 'create':
      return 0;
    case 'load':
    case 'check':
      return 1;
  }
}

export function isInit({ type }: TraceEvent): boolean {
  switch (type) {
    case 'init':
      return true;
    default:
      return false;
  }
}
