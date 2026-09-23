import { NexusError } from './nexus-error.js';

/** load() received a global module. */
export class LoadError extends NexusError {
  declare readonly code: 'NEXUS_LOAD_GLOBAL_MODULE';
  readonly module: string;

  constructor(fields: { module: string }) {
    super(
      'NEXUS_LOAD_GLOBAL_MODULE',
      `${fields.module} is global and cannot be loaded after startup, because every module's bindings are already computed.\n` +
        `  Fix: import ${fields.module} from the root module, or make it non-global.`,
    );
    this.name = 'LoadError';
    this.module = fields.module;
  }
}
