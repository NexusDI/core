import { NexusError } from './nexus-error.js';

/** Two imports export different providers of one plain token. */
export class AmbiguousProviderError extends NexusError {
  declare readonly code: 'NEXUS_AMBIGUOUS_PROVIDER';
  readonly token: string;
  readonly module: string;
  readonly candidates: readonly string[];

  constructor(fields: {
    token: string;
    module: string;
    candidates: readonly string[];
  }) {
    super(
      'NEXUS_AMBIGUOUS_PROVIDER',
      `${fields.module} sees ${fields.token} from ${fields.candidates.join(' and ')}, and they provide different instances.\n` +
        `  Fix: export ${fields.token} from one of them only, or provide ${fields.token} in ${fields.module}, which shadows the imports.`,
    );
    this.name = 'AmbiguousProviderError';
    this.token = fields.token;
    this.module = fields.module;
    this.candidates = fields.candidates;
  }
}
