import { NexusError } from './nexus-error.js';

/** runInScope() on a container created without a ScopeContext. */
export class NoScopeContextError extends NexusError {
  declare readonly code: 'NEXUS_NO_SCOPE_CONTEXT';

  constructor() {
    super(
      'NEXUS_NO_SCOPE_CONTEXT',
      'runInScope() needs a ScopeContext, and this container was created without one.\n' +
        "  Fix: Nexus.create(Root, { scopeContext: nodeScopeContext() }), with nodeScopeContext from '@nexusdi/core/node'.",
    );
    this.name = 'NoScopeContextError';
  }
}
