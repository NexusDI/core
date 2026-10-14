import type { TraceEvent } from '@acme/core';

type Type = TraceEvent['type'];

export const SEEN = new Set<Type>(['construct', 'init']);

export const TALLY: Partial<Record<Type, number>> = { construct: 1, 'init': 2 };

export const LIST: readonly Type[] = ['construct'];

export const CHECKED = ['init'] satisfies readonly Type[];

export const LABELS = new Map<Type, string>([['construct', 'C']]);
