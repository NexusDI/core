import { errorBase } from '@acme/nexusdi-core';

export class DisposedError extends errorBase<
  'NEXUS_DISPOSED',
  { readonly scope: string }
>('NEXUS_DISPOSED', 'DisposedError') {}

export class MissingProviderError extends errorBase<
  'NEXUS_MISSING_PROVIDER',
  { readonly token: string }
>('NEXUS_MISSING_PROVIDER', 'MissingProviderError') {}

/** The owner may compare its own codes. */
export function isDisposed(error: { readonly code: string }): boolean {
  return error.code === 'NEXUS_DISPOSED';
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_DISPOSED: DisposedError;
    NEXUS_MISSING_PROVIDER: MissingProviderError;
  }
}
