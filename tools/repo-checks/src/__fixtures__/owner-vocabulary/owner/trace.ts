export type Lifetime = 'singleton' | 'scoped' | 'transient';

/** The operation a run is. */
export type RunKind = 'create' | 'load' | 'createScope' | 'extend';

/** Each trace event type's fields. A package adds its own by augmentation. */
export interface TraceEventByType {
  compile: { phase: 'create' | 'load' | 'check'; durationMs: number };
  construct: { token: string; lifetime: Lifetime | null; durationMs: number };
  init: { token: string };
  run: { kind: RunKind; durationMs: number };
  'scope:create': { scope: string };
  dispose: { disposed: number };
}

export type TraceEvent<
  K extends keyof TraceEventByType = keyof TraceEventByType,
> = {
  [T in K]: { readonly type: T } & TraceEventByType[T];
}[K];

const WEIGHT = { compile: 2, construct: 1, init: 0, run: 0, 'scope:create': 0, dispose: 0 };

/** The owner may key a table on its own event types. */
export const weightOf = (event: TraceEvent): number => WEIGHT[event.type];
