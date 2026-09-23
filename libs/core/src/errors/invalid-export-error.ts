import { NexusError } from './nexus-error.js';

/** A module exports a token it cannot see, or a module it does not import. */
export class InvalidExportError extends NexusError {
  declare readonly code: 'NEXUS_INVALID_EXPORT';
  readonly token: string;
  readonly module: string;

  constructor(fields: { token: string; module: string }) {
    super(
      'NEXUS_INVALID_EXPORT',
      `${fields.module} exports ${fields.token}, which it neither provides nor sees through an import.\n` +
        `  Fix: provide ${fields.token} in ${fields.module}, or import the module that exports it.`,
    );
    this.name = 'InvalidExportError';
    this.token = fields.token;
    this.module = fields.module;
  }
}
