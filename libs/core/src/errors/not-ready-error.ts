import { errorBase } from './nexus-error.js';

interface NotReadyFields {
  readonly owner: string;
  readonly target: string;
  /** The runtime cycle, when the target is being built, or empty. */
  readonly path: readonly string[];
}

/** A lazy() thunk ran before its target was ready. */
export class NotReadyError extends errorBase<'NEXUS_NOT_READY', NotReadyFields>(
  'NEXUS_NOT_READY',
  'NotReadyError',
) {}
