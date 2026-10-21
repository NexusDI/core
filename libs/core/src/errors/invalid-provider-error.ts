import { errorBase } from './nexus-error.js';
import type { InvalidProviderReason } from './reasons.js';

interface InvalidProviderFields {
  readonly module: string;
  readonly index: number;
  readonly reason: InvalidProviderReason;
  /** The values the reason names, such as the value an entry holds. */
  readonly detail: readonly string[];
}

/** An entry in a module's providers is malformed. */
export class InvalidProviderError extends errorBase<
  'NEXUS_INVALID_PROVIDER',
  InvalidProviderFields
>('NEXUS_INVALID_PROVIDER', 'InvalidProviderError') {}
