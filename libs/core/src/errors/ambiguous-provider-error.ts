import { errorBase } from './nexus-error.js';

interface AmbiguousProviderFields {
  readonly token: string;
  readonly module: string;
  readonly candidates: readonly string[];
}

/** Two imports export different providers of one plain token. */
export class AmbiguousProviderError extends errorBase<
  'NEXUS_AMBIGUOUS_PROVIDER',
  AmbiguousProviderFields
>('NEXUS_AMBIGUOUS_PROVIDER', 'AmbiguousProviderError') {}
