import type {} from '@acme/core';

declare module '@acme/core' {
  interface TraceEventByType {
    '@acme/shields/raise': { sector: string; level: 'low' | 'high' };
  }
}

/** The owner of an event type may write its key anywhere. */
export const RAISE = '@acme/shields/raise';
