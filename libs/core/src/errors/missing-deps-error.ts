import { errorBase } from './nexus-error.js';

interface MissingDepsFields {
  readonly token: string;
  readonly module: string;
  readonly arity: number;
  /** The class a useClass binding names, or null when the class is its own token. */
  readonly useClass: string | null;
  /** True for a class listed bare in providers, which reads @Injectable. */
  readonly bare: boolean;
}

/** A class with constructor parameters was registered without deps. */
export class MissingDepsError extends errorBase<
  'NEXUS_MISSING_DEPS',
  MissingDepsFields
>('NEXUS_MISSING_DEPS', 'MissingDepsError') {}
