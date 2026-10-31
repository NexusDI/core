import { errorBase } from './nexus-error.js';

/** Why a load import is rejected. */
export type LoadImportReason = 'not-in-graph' | 'root' | 'already-loaded';

interface LoadImportFields {
  /** The module load() received. */
  readonly module: string;
  /**
   * The name of the imported module the reason is about. For `already-loaded`
   * it is the first requested module the recorded load imports lack, or the first
   * requested module when the request only drops modules from the record.
   */
  readonly imported: string;
  readonly reason: LoadImportReason;
}

/** load() received a load import it cannot apply: the imported module is not in the graph, is the root, or the load module is already in the graph. */
export class LoadImportError extends errorBase<
  'NEXUS_LOAD_IMPORT',
  LoadImportFields
>('NEXUS_LOAD_IMPORT', 'LoadImportError') {}
