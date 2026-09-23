import { NexusError } from './nexus-error.js';

/** A scoped provider or REQUEST was resolved from the root. */
export class ScopeRequiredError extends NexusError {
  declare readonly code: 'NEXUS_SCOPE_REQUIRED';
  readonly token: string;
  readonly path: readonly string[];

  constructor(fields: { token: string; path: readonly string[] }) {
    const via =
      fields.path.length > 1
        ? ` It was reached through ${fields.path.join(' → ')}.`
        : '';
    super(
      'NEXUS_SCOPE_REQUIRED',
      `${fields.token} is scoped, and the root container has no scope.${via}\n` +
        `  Fix: resolve it from a scope: const scope = await ship.createScope(); scope.get(${fields.token}).`,
    );
    this.name = 'ScopeRequiredError';
    this.token = fields.token;
    this.path = fields.path;
  }
}
