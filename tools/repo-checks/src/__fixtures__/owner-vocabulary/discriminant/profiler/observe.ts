import type { TraceEvent } from '@acme/core';

/**
 * P1 as the owner amended it on 2026-10-14: a compare against a union the
 * owner exports, which the compiler checks, reads through that export. The
 * default branch handles a member the owner adds later (P2).
 */
export function observe(event: TraceEvent, spans: string[]): void {
  switch (event.type) {
    case 'construct':
      spans.push(event.token);
      break;
    case 'run':
      if (event.kind === 'create') spans.push('create');
      break;
    default:
      break;
  }
  if (event.type === 'compile') spans.push('compile');
}
