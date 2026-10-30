import { errorBase } from './nexus-error.js';

interface NotReadyFields {
  readonly owner: string;
  /**
   * The token the thunk names: the multi token for a lazy(all()) thunk, the
   * token passed to lazy() for a lazy() thunk.
   */
  readonly target: string;
  /**
   * For a lazy() thunk whose token is an alias, the provider at the end of
   * the alias chain, which was not ready. Null for any other thunk.
   */
  readonly provider: string | null;
  /**
   * The runtime cycle, when the target is being built, or empty. It ends
   * with the provider the thunk refused.
   */
  readonly path: readonly string[];
  /**
   * The unready contribution a lazy(all()) thunk met first, as
   * `<label> (module <module name>)`, or null for any other thunk.
   */
  readonly contributor: string | null;
}

/** A lazy() thunk ran before its target was ready. */
export class NotReadyError extends errorBase<'NEXUS_NOT_READY', NotReadyFields>(
  'NEXUS_NOT_READY',
  'NotReadyError',
) {}
