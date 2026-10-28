import { errorBase } from './nexus-error.js';

/** Why a load grant is rejected. */
export type LoadGrantReason = 'not-in-graph' | 'root' | 'already-loaded';

interface LoadGrantFields {
  /** The module load() received. */
  readonly module: string;
  /**
   * The name of the granted module the reason is about. For `already-loaded`
   * it is the first requested module the recorded grant lacks, or the first
   * requested module when the request only drops modules from the record.
   */
  readonly grant: string;
  readonly reason: LoadGrantReason;
}

/** load() received a grant it cannot apply: the granted module is not in the graph, is the root, or the load module is already in the graph. */
export class LoadGrantError extends errorBase<
  'NEXUS_LOAD_GRANT',
  LoadGrantFields
>('NEXUS_LOAD_GRANT', 'LoadGrantError') {}
