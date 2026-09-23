import { NexusError } from './nexus-error.js';

/** A dependency cycle with no lazy() edge in it. */
export class CircularDependencyError extends NexusError {
  declare readonly code: 'NEXUS_CIRCULAR_DEPENDENCY';
  readonly path: readonly string[];

  constructor(fields: { path: readonly string[] }) {
    const [from = '?', to = '?'] = fields.path;
    super(
      'NEXUS_CIRCULAR_DEPENDENCY',
      `${fields.path.join(' → ')} is a dependency cycle.\n` +
        `  Fix: wrap one edge in lazy(), for example the dependency of ${from} on ${to}: lazy(${to}).`,
    );
    this.name = 'CircularDependencyError';
    this.path = fields.path;
  }
}
