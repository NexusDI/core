import { NexusError } from './nexus-error.js';

/** One module provides the same plain token twice. */
export class DuplicateProviderError extends NexusError {
  declare readonly code: 'NEXUS_DUPLICATE_PROVIDER';
  readonly token: string;
  readonly module: string;

  constructor(fields: { token: string; module: string }) {
    super(
      'NEXUS_DUPLICATE_PROVIDER',
      `${fields.module} provides ${fields.token} twice.\n  Fix: remove one of them, or use a MultiToken to collect several.`,
    );
    this.name = 'DuplicateProviderError';
    this.token = fields.token;
    this.module = fields.module;
  }
}
