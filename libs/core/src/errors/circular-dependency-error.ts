import { errorBase } from './nexus-error.js';

interface CircularDependencyFields {
  readonly path: readonly string[];
  /**
   * How each step of `path` depends on the next, so `kinds[i]` joins
   * `path[i]` to `path[i + 1]`. One fewer entry than `path`. `alias` marks a
   * useExisting target. A step with several edges that order the build
   * reports the first one its provider declares.
   */
  readonly kinds: readonly ('required' | 'optional' | 'all' | 'alias')[];
}

/** A dependency cycle with no lazy() edge in it. */
export class CircularDependencyError extends errorBase<
  'NEXUS_CIRCULAR_DEPENDENCY',
  CircularDependencyFields
>('NEXUS_CIRCULAR_DEPENDENCY', 'CircularDependencyError') {}
