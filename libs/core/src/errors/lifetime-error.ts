import { NexusError } from './nexus-error.js';

/** The lifetimes a path reports. `null` marks an alias. */
export type ErrorLifetime = 'singleton' | 'scoped' | 'transient';

/** A singleton reaches a scoped provider or REQUEST. */
export class LifetimeError extends NexusError {
  declare readonly code: 'NEXUS_LIFETIME_VIOLATION';
  readonly path: readonly string[];
  readonly lifetimes: readonly (ErrorLifetime | null)[];

  constructor(fields: {
    path: readonly string[];
    lifetimes: readonly (ErrorLifetime | null)[];
  }) {
    const steps = fields.path
      .map((name, i) => `${name} (${fields.lifetimes[i] ?? 'alias'})`)
      .join(' → ');
    const first = fields.path[0] ?? '?';
    super(
      'NEXUS_LIFETIME_VIOLATION',
      `${first} is a singleton and captures a scoped provider: ${steps}. A singleton outlives every scope.\n` +
        `  Fix: make ${first} scoped, or move the scoped dependency out of its dependency chain.`,
    );
    this.name = 'LifetimeError';
    this.path = fields.path;
    this.lifetimes = fields.lifetimes;
  }
}
