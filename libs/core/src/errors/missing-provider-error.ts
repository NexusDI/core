import { errorBase } from './nexus-error.js';

/** A place the token exists that the requester cannot see. */
export type NearMiss =
  | { readonly kind: 'not-exported'; readonly module: string }
  | { readonly kind: 'not-imported'; readonly module: string }
  | { readonly kind: 'same-description'; readonly module: string };

interface MissingProviderFields {
  readonly token: string;
  readonly requester: string | null;
  readonly module: string;
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;
  readonly nearMisses: readonly NearMiss[];
}

/** No provider of a token is visible where it was requested. */
export class MissingProviderError extends errorBase<
  'NEXUS_MISSING_PROVIDER',
  MissingProviderFields
>('NEXUS_MISSING_PROVIDER', 'MissingProviderError') {}
