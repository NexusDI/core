import { errorBase } from './nexus-error.js';

interface ScopeRequiredFields {
  readonly token: string;
  readonly path: readonly string[];
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;
}

/** A scoped provider or REQUEST was resolved from the root. */
export class ScopeRequiredError extends errorBase<
  'NEXUS_SCOPE_REQUIRED',
  ScopeRequiredFields
>('NEXUS_SCOPE_REQUIRED', 'ScopeRequiredError') {}
