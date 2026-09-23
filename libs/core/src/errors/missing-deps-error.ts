import { NexusError } from './nexus-error.js';

/** A class with constructor parameters was registered without deps. */
export class MissingDepsError extends NexusError {
  declare readonly code: 'NEXUS_MISSING_DEPS';
  readonly token: string;
  readonly module: string;
  readonly arity: number;

  constructor(fields: { token: string; module: string; arity: number }) {
    const s = fields.arity === 1 ? '' : 's';
    super(
      'NEXUS_MISSING_DEPS',
      `${fields.token} in ${fields.module} takes ${fields.arity} constructor parameter${s} and has no deps.\n` +
        `  Fix: provide(${fields.token}, { deps: [...] }), or decorate it with @Injectable({ deps }).`,
    );
    this.name = 'MissingDepsError';
    this.token = fields.token;
    this.module = fields.module;
    this.arity = fields.arity;
  }
}
