import { errorBase } from './nexus-error.js';

interface InvalidModuleFields {
  readonly received: string;
  /** The import path that reached the value, empty outside the walk. */
  readonly path: readonly string[];
}

/** A value used as a module is not a module definition or an @Module class. */
export class InvalidModuleError extends errorBase<
  'NEXUS_INVALID_MODULE',
  InvalidModuleFields
>('NEXUS_INVALID_MODULE', 'InvalidModuleError') {}
