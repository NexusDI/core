import { errorBase } from './nexus-error.js';

interface DuplicateProviderFields {
  readonly token: string;
  readonly module: string;
}

/** One module provides the same plain token twice. */
export class DuplicateProviderError extends errorBase<
  'NEXUS_DUPLICATE_PROVIDER',
  DuplicateProviderFields
>('NEXUS_DUPLICATE_PROVIDER', 'DuplicateProviderError') {}
