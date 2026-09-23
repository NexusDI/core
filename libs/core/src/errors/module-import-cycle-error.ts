import { NexusError } from './nexus-error.js';

/** Modules import each other in a loop. */
export class ModuleImportCycleError extends NexusError {
  declare readonly code: 'NEXUS_MODULE_IMPORT_CYCLE';
  readonly path: readonly string[];

  constructor(fields: { path: readonly string[] }) {
    super(
      'NEXUS_MODULE_IMPORT_CYCLE',
      `${fields.path.join(' → ')} is a module import cycle.\n  Fix: move the shared providers into a module that both import.`,
    );
    this.name = 'ModuleImportCycleError';
    this.path = fields.path;
  }
}
