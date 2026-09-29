import { errorBase } from './nexus-error.js';
import type { InvalidTokenReason } from './reasons.js';

interface InvalidTokenFields {
  readonly received: string;
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;
  /** The module whose providers entry holds the value, or null outside compilation. */
  readonly module: string | null;
  /** The index of that providers entry, or null outside compilation. */
  readonly index: number | null;
  /** Why the value is not a token, or null for a value that is none of the token kinds. */
  readonly reason: InvalidTokenReason | null;
  /** The values the reason names. */
  readonly detail: readonly string[];
  /** True when another copy of core made the value. */
  readonly otherCopy: boolean;
}

/** A value used as a token is not a class, a Token or a MultiToken. */
export class InvalidTokenError extends errorBase<
  'NEXUS_INVALID_TOKEN',
  InvalidTokenFields
>('NEXUS_INVALID_TOKEN', 'InvalidTokenError') {}
