import { NexusError } from './nexus-error.js';

/** A value used as a token is not a class, a Token or a MultiToken. */
export class InvalidTokenError extends NexusError {
  declare readonly code: 'NEXUS_INVALID_TOKEN';
  readonly received: string;
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;
  /** The module whose providers entry holds the value, or null outside compilation. */
  readonly module: string | null;
  /** The index of that providers entry, or null outside compilation. */
  readonly index: number | null;

  constructor(fields: {
    received: string;
    reason?: string;
    entry?: string;
    module?: string;
    index?: number;
  }) {
    const at =
      fields.entry ??
      (fields.module === undefined || fields.index === undefined
        ? undefined
        : `${fields.module}.providers[${fields.index}]`);
    super(
      'NEXUS_INVALID_TOKEN',
      `${at === undefined ? '' : `${at}: `}${fields.received} ${fields.reason ?? 'is not a token. A token is a class, a Token or a MultiToken.'}`,
    );
    this.name = 'InvalidTokenError';
    this.received = fields.received;
    this.entry = fields.entry ?? null;
    this.module = fields.module ?? null;
    this.index = fields.index ?? null;
  }
}
