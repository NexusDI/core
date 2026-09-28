import { errorBase } from './nexus-error.js';

/** The lifetimes a path reports. `null` marks an alias. */
export type ErrorLifetime = 'singleton' | 'scoped' | 'transient';

interface LifetimeFields {
  readonly path: readonly string[];
  readonly lifetimes: readonly (ErrorLifetime | null)[];
}

/** A singleton reaches a scoped provider or REQUEST. */
export class LifetimeError extends errorBase<
  'NEXUS_LIFETIME_VIOLATION',
  LifetimeFields
>('NEXUS_LIFETIME_VIOLATION', 'LifetimeError') {}
