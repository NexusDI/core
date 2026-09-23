import { NexusError } from './nexus-error.js';

/** A value used as a token is not a class, a Token or a MultiToken. */
export class InvalidTokenError extends NexusError {
  declare readonly code: 'NEXUS_INVALID_TOKEN';
  readonly received: string;

  constructor(fields: { received: string; reason?: string }) {
    super(
      'NEXUS_INVALID_TOKEN',
      `${fields.received} ${fields.reason ?? 'is not a token. A token is a class, a Token or a MultiToken.'}`,
    );
    this.name = 'InvalidTokenError';
    this.received = fields.received;
  }
}
