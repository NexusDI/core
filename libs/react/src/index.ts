'use client';
export {
  NestedScopeError,
  NoProviderError,
  SectionConflictError,
  TransientInRenderError,
} from './errors.js';
export { NexusProvider, type NexusProviderProps } from './provider.js';
export { useContainer, useService } from './use-service.js';
export { react } from './plugin.js';
export { ScopeProvider, type ScopeProviderProps } from './scope-provider.js';
export {
  lazySection,
  SectionBoundary,
  type LazySection,
  type SectionBoundaryProps,
} from './section.js';
