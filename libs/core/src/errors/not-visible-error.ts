import { errorBase } from './nexus-error.js';

interface NotVisibleFields {
  readonly token: string;
  readonly owners: readonly string[];
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;
}

/** A root get() of a token that exists but is private to other modules. */
export class NotVisibleError extends errorBase<
  'NEXUS_NOT_VISIBLE',
  NotVisibleFields
>('NEXUS_NOT_VISIBLE', 'NotVisibleError') {}
