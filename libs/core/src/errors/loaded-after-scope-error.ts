import { errorBase } from './nexus-error.js';

interface LoadedAfterScopeFields {
  readonly token: string;
  readonly module: string;
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;
}

/** A scope was asked for a token from a module loaded after the scope was created. */
export class LoadedAfterScopeError extends errorBase<
  'NEXUS_LOADED_AFTER_SCOPE',
  LoadedAfterScopeFields
>('NEXUS_LOADED_AFTER_SCOPE', 'LoadedAfterScopeError') {}
