import { NexusError } from './nexus-error.js';

/** A class with constructor parameters was registered without deps. */
export class MissingDepsError extends NexusError {
  declare readonly code: 'NEXUS_MISSING_DEPS';
  readonly token: string;
  readonly module: string;
  readonly arity: number;
  /** The class a useClass binding names, or null when the class is its own token. */
  readonly useClass: string | null;

  constructor(fields: {
    token: string;
    module: string;
    arity: number;
    useClass?: string | null;
  }) {
    const useClass = fields.useClass ?? null;
    const s = fields.arity === 1 ? '' : 's';
    const subject =
      useClass === null
        ? fields.token
        : `${useClass} (useClass for ${fields.token})`;
    super(
      'NEXUS_MISSING_DEPS',
      `${subject} in ${fields.module} takes ${fields.arity} constructor parameter${s} and has no deps.\n` +
        `  Fix: add deps to the binding, declare static deps = [...] as const on ${useClass ?? fields.token}, or decorate it with @Injectable({ deps }).`,
    );
    this.name = 'MissingDepsError';
    this.token = fields.token;
    this.module = fields.module;
    this.arity = fields.arity;
    this.useClass = useClass;
  }
}
