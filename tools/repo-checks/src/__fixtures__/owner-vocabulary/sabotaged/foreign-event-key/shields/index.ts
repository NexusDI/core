import type {} from '@acme/core';

declare module '@acme/core' {
  interface TraceEventByType {
    '@acme/shields/raise': { sector: string };
  }
}
