import { describe, expect, it } from 'vitest';

import * as api from './index.js';

/**
 * The runtime exports, restated so that adding one is a deliberate edit to
 * this list and not a side effect of a barrel edit.
 */
const RUNTIME_EXPORTS: string[] = [
  'all',
  'AmbiguousProviderError',
  'AsyncTransientError',
  'BlueprintError',
  'CircularDependencyError',
  'defineModule',
  'DisposedError',
  'DuplicateProviderError',
  'Inject',
  'Injectable',
  'InvalidExportError',
  'InvalidModuleError',
  'InvalidProviderError',
  'InvalidTokenError',
  'lazy',
  'LegacyDecoratorsError',
  'LifetimeError',
  'LoadedAfterScopeError',
  'LoadError',
  'MissingDepsError',
  'MissingProviderError',
  'Module',
  'ModuleImportCycleError',
  'ModuleOptionsError',
  'MultiToken',
  'Nexus',
  'NexusError',
  'NoScopeContextError',
  'NotReadyError',
  'NotVisibleError',
  'optional',
  'OverrideError',
  'provide',
  'ProviderError',
  'REQUEST',
  'RequestMissingError',
  'ScopeRequiredError',
  'Token',
];

describe('@nexusdi/core', () => {
  it('exports exactly the public runtime API', () => {
    expect(Object.keys(api).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });
});
