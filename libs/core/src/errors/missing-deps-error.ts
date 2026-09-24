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
    /** True for a class listed bare in providers, which reads @Injectable. */
    bare?: boolean;
  }) {
    const useClass = fields.useClass ?? null;
    const s = fields.arity === 1 ? '' : 's';
    const cls = useClass ?? fields.token;
    const subject =
      useClass === null ? cls : `${useClass} (useClass for ${fields.token})`;
    const declare = `declare static deps = [...] as const on ${cls}`;
    const decorate = 'decorate it with @Injectable({ deps })';
    // Each form reads deps from different places (spec §3.2), so each gets
    // only the fixes that form reads.
    const fix =
      useClass !== null
        ? `add deps to the binding, ${declare}, or ${decorate}.`
        : fields.bare === true
          ? `${declare}, ${decorate}, or list provide(${cls}, { deps: [...] }) in providers.`
          : `add deps to the binding, or ${declare}. A binding of a class to itself does not read @Injectable deps.`;
    super(
      'NEXUS_MISSING_DEPS',
      `${subject} in ${fields.module} takes ${fields.arity} constructor parameter${s} and has no deps.\n` +
        `  Fix: ${fix}`,
    );
    this.name = 'MissingDepsError';
    this.token = fields.token;
    this.module = fields.module;
    this.arity = fields.arity;
    this.useClass = useClass;
  }
}
