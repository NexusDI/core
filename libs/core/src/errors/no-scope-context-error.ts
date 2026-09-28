import { errorBase } from './nexus-error.js';

/** runInScope() on a container created without a ScopeContext. */
export class NoScopeContextError extends errorBase<
  'NEXUS_NO_SCOPE_CONTEXT',
  Record<never, never>
>('NEXUS_NO_SCOPE_CONTEXT', 'NoScopeContextError') {}
