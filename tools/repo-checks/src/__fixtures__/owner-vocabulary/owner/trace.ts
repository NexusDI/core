/** Each trace event type's fields. A package adds its own by augmentation. */
export interface TraceEventByType {
  compile: { phase: 'create' | 'load' | 'check'; durationMs: number };
  construct: { token: string; durationMs: number };
  init: { token: string };
  dispose: { disposed: number };
}

export type TraceEvent<
  K extends keyof TraceEventByType = keyof TraceEventByType,
> = {
  [T in K]: { readonly type: T } & TraceEventByType[T];
}[K];

const WEIGHT = { compile: 2, construct: 1, init: 0, dispose: 0 };

/** The owner may key a table on its own event types. */
export const weightOf = (event: TraceEvent): number => WEIGHT[event.type];
