import { NexusError } from './nexus-error.js';

/** An entry in a module's providers is malformed. */
export class InvalidProviderError extends NexusError {
  declare readonly code: 'NEXUS_INVALID_PROVIDER';
  readonly module: string;
  readonly index: number;
  readonly reason: string;

  constructor(fields: { module: string; index: number; reason: string }) {
    super(
      'NEXUS_INVALID_PROVIDER',
      `${fields.module}.providers[${fields.index}] ${fields.reason}.`,
    );
    this.name = 'InvalidProviderError';
    this.module = fields.module;
    this.index = fields.index;
    this.reason = fields.reason;
  }
}
