import { errorBase } from './nexus-error.js';

interface ModuleImportCycleFields {
  readonly path: readonly string[];
}

/** Modules import each other in a loop. */
export class ModuleImportCycleError extends errorBase<
  'NEXUS_MODULE_IMPORT_CYCLE',
  ModuleImportCycleFields
>('NEXUS_MODULE_IMPORT_CYCLE', 'ModuleImportCycleError') {}
