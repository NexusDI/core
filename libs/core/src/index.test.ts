import { describe, expect, it } from 'vitest';

import * as api from './index.js';

/**
 * The runtime exports, restated so that adding one is a deliberate edit to
 * this list and not a side effect of a barrel edit.
 */
const RUNTIME_EXPORTS: string[] = [
  'AmbiguousProviderError',
  'AsyncTransientError',
  'BlueprintError',
  'CircularDependencyError',
  'DisposedError',
  'DuplicateProviderError',
  'InvalidExportError',
  'InvalidModuleError',
  'InvalidProviderError',
  'InvalidTokenError',
  'LegacyDecoratorsError',
  'LifetimeError',
  'LoadedAfterScopeError',
  'LoadError',
  'MissingDepsError',
  'MissingProviderError',
  'ModuleImportCycleError',
  'ModuleOptionsError',
  'MultiToken',
  'NexusError',
  'NoScopeContextError',
  'NotReadyError',
  'NotVisibleError',
  'OverrideError',
  'ProviderError',
  'RequestMissingError',
  'ScopeRequiredError',
  'Token',
];

describe('@nexusdi/core', () => {
  it('exports exactly the public runtime API', () => {
    expect(Object.keys(api).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });
});
