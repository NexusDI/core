import type { TraceEvent } from '@acme/core';
import type {} from '@acme/shields';

export const RAISE = '@acme/shields/raise';

export const WEIGHT: Partial<Record<TraceEvent['type'], number>> = {
  '@acme/shields/raise': 3,
};

export const LOUD: TraceEvent['type'][] = ['@acme/shields/raise'];

export const SEEN = new Set<TraceEvent['type']>(['@acme/shields/raise']);

export const isRaise = (event: TraceEvent): boolean =>
  event.type === '@acme/shields/raise';
