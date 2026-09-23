import { NexusError } from './nexus-error.js';

/** A root get() of a token that exists but is private to other modules. */
export class NotVisibleError extends NexusError {
  declare readonly code: 'NEXUS_NOT_VISIBLE';
  readonly token: string;
  readonly owners: readonly string[];

  constructor(fields: { token: string; owners: readonly string[] }) {
    const owner = fields.owners[0] ?? '?';
    super(
      'NEXUS_NOT_VISIBLE',
      `${fields.token} is provided in ${fields.owners.join(', ')}, and the lookup module cannot see it.\n` +
        `  Fix: export it along a path to the root module, or call get(${fields.token}, { module: ${owner} }).`,
    );
    this.name = 'NotVisibleError';
    this.token = fields.token;
    this.owners = fields.owners;
  }
}
