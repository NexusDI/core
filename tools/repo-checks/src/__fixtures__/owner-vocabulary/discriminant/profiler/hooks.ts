import type { TraceEvent } from '@acme/core';

/** A package's own union that spells core's keys is no read of them. */
type Hook = 'init' | 'dispose';

const HOOKS = new Set<Hook>();
export const hasHook = (hook: Hook): boolean => HOOKS.has(hook);
export const hookLine = (hook: Hook): string => `hook ${hook}`;

const CONSTRUCT = 'construct';
export const isConstruct = (event: TraceEvent): boolean =>
  event.type === CONSTRUCT;

const TYPED: TraceEvent['type'] = 'construct';
export const isTyped = (event: TraceEvent): boolean => event.type === TYPED;

export const sameType = (event: TraceEvent, other: TraceEvent): boolean =>
  event.type === other.type;
