import { errorBase } from './nexus-error.js';

interface NotReadyFields {
  readonly owner: string;
  /**
   * For a lazy(all()) thunk, the multi token. For a lazy() thunk, the
   * provider the thunk refused, after alias hops.
   */
  readonly target: string;
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
