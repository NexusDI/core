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
  'declareClass',
  'declareModuleClass',
  'declareProperty',
  'defineModule',
  'describeValue',
  'displayName',
  'DisposedError',
  'DOCS_URL',
  'DuplicateProviderError',
  'errorBase',
  'InvalidExportError',
  'InvalidModuleError',
  'InvalidProviderError',
  'InvalidTokenError',
  'isForeign',
  'isNexusError',
  'lazy',
  'LazyAsyncError',
  'LifetimeError',
  'LoadedAfterScopeError',
  'LoadError',
  'MissingDepsError',
  'MissingProviderError',
  'moduleDefinitionOf',
  'ModuleImportCycleError',
  'ModuleOptionsError',
  'MultiToken',
  'Nexus',
  'NEXUS_PLUGIN_API',
  'NexusError',
  'NotReadyError',
  'NotVisibleError',
  'optional',
  'PluginError',
  'provide',
  'ProviderError',
  'REQUEST',
  'RequestMissingError',
  'ScopeRequiredError',
  'SUPPORTED_PLUGIN_APIS',
  'Token',
];

describe('@nexusdi/core', () => {
  it('exports exactly the public runtime API', () => {
    expect(Object.keys(api).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });
});
