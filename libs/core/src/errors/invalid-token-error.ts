import { NexusError } from './nexus-error.js';

/** A value used as a token is not a class, a Token or a MultiToken. */
export class InvalidTokenError extends NexusError {
  declare readonly code: 'NEXUS_INVALID_TOKEN';
  readonly received: string;
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;

  constructor(fields: { received: string; reason?: string; entry?: string }) {
    const at = fields.entry === undefined ? '' : `${fields.entry}: `;
    super(
      'NEXUS_INVALID_TOKEN',
      `${at}${fields.received} ${fields.reason ?? 'is not a token. A token is a class, a Token or a MultiToken.'}`,
    );
    this.name = 'InvalidTokenError';
    this.received = fields.received;
    this.entry = fields.entry ?? null;
  }
}
