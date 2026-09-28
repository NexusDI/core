import { errorBase } from './nexus-error.js';

/** Another failure from the same startup level. */
export interface ProviderFailure {
  readonly token: string;
  readonly module: string;
  readonly cause: unknown;
}

interface ProviderFields {
  readonly token: string;
  readonly module: string;
  readonly path: readonly string[];
  readonly alsoFailed: readonly ProviderFailure[];
  readonly disposalErrors: readonly unknown[];
}

/** A constructor, factory, onInit or options validation failed. `cause` is Error.cause. */
export class ProviderError extends errorBase<
  'NEXUS_PROVIDER_FAILED',
  ProviderFields
>('NEXUS_PROVIDER_FAILED', 'ProviderError') {}
