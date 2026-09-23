import { NexusError } from './nexus-error.js';

/** A scope was asked for a token from a module loaded after the scope was created. */
export class LoadedAfterScopeError extends NexusError {
  declare readonly code: 'NEXUS_LOADED_AFTER_SCOPE';
  readonly token: string;
  readonly module: string;
  /** The deps entry of resolve() or validate() this error is about, or null. */
  readonly entry: string | null;

  constructor(fields: { token: string; module: string; entry?: string }) {
    const at = fields.entry === undefined ? '' : `${fields.entry}: `;
    super(
      'NEXUS_LOADED_AFTER_SCOPE',
      `${at}${fields.token} comes from ${fields.module}, which was loaded after this scope was created. A scope resolves against the graph current at its creation.\n` +
        `  Fix: create a new scope.`,
    );
    this.name = 'LoadedAfterScopeError';
    this.token = fields.token;
    this.module = fields.module;
    this.entry = fields.entry ?? null;
  }
}
