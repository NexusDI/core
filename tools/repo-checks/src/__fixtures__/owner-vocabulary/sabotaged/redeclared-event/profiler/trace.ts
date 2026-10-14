import type {} from '@acme/core';

declare module '@acme/core' {
  interface TraceEventByType {
    init: { token: string };
    '@acme/profiler/sample': { at: number };
  }
}
