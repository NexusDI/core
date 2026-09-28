import { errorBase } from './nexus-error.js';

interface CircularDependencyFields {
  readonly path: readonly string[];
}

/** A dependency cycle with no lazy() edge in it. */
export class CircularDependencyError extends errorBase<
  'NEXUS_CIRCULAR_DEPENDENCY',
  CircularDependencyFields
>('NEXUS_CIRCULAR_DEPENDENCY', 'CircularDependencyError') {}
