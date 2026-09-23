import { NexusError } from './nexus-error.js';

/** A value used as a module is not a module definition or an @Module class. */
export class InvalidModuleError extends NexusError {
  declare readonly code: 'NEXUS_INVALID_MODULE';
  readonly received: string;
  readonly path: readonly string[];

  constructor(fields: { received: string; path: readonly string[] }) {
    const where =
      fields.path.length > 0 ? ` (imported by ${fields.path.join(' → ')})` : '';
    super(
      'NEXUS_INVALID_MODULE',
      `${fields.received} is not a module${where}.\n  Fix: create one with defineModule(), or decorate a class with @Module.`,
    );
    this.name = 'InvalidModuleError';
    this.received = fields.received;
    this.path = fields.path;
  }
}
