import { NexusError } from './nexus-error.js';

/** A root get() of a token that exists but is private to other modules. */
export class NotVisibleError extends NexusError {
  declare readonly code: 'NEXUS_NOT_VISIBLE';
  readonly token: string;
  readonly owners: readonly string[];
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;

  constructor(fields: {
    token: string;
    owners: readonly string[];
    entry?: string;
  }) {
    const owner = fields.owners[0] ?? '?';
    const at = fields.entry === undefined ? '' : `${fields.entry}: `;
    super(
      'NEXUS_NOT_VISIBLE',
      `${at}${fields.token} is provided in ${fields.owners.join(', ')}, and the lookup module cannot see it.\n` +
        `  Fix: export it along a path to the root module, or call get(${fields.token}, { module: ${owner} }).`,
    );
    this.name = 'NotVisibleError';
    this.token = fields.token;
    this.owners = fields.owners;
    this.entry = fields.entry ?? null;
  }
}
