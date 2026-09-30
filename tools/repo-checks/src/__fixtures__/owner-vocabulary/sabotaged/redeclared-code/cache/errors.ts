import type { DisposedError } from '@acme/core';

export const isDisposed = (error: { readonly code: string }): boolean =>
  error.code === 'NEXUS_DISPOSED';

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_DISPOSED: DisposedError;
  }
}
