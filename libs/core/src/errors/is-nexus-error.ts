import type { AmbiguousProviderError } from './ambiguous-provider-error.js';
import type { AsyncTransientError } from './async-transient-error.js';
import type { BlueprintError } from './blueprint-error.js';
import type { CircularDependencyError } from './circular-dependency-error.js';
import type { DisposedError } from './disposed-error.js';
import type { DuplicateProviderError } from './duplicate-provider-error.js';
import type { InvalidExportError } from './invalid-export-error.js';
import type { InvalidModuleError } from './invalid-module-error.js';
import type { InvalidProviderError } from './invalid-provider-error.js';
import type { InvalidTokenError } from './invalid-token-error.js';
import type { LegacyDecoratorsError } from './legacy-decorators-error.js';
import type { LifetimeError } from './lifetime-error.js';
import type { LoadError } from './load-error.js';
import type { LoadedAfterScopeError } from './loaded-after-scope-error.js';
import type { MissingDepsError } from './missing-deps-error.js';
import type { MissingProviderError } from './missing-provider-error.js';
import type { ModuleImportCycleError } from './module-import-cycle-error.js';
import type { ModuleOptionsError } from './module-options-error.js';
import { ERROR_BRAND } from './nexus-error.js';
import type { NoScopeContextError } from './no-scope-context-error.js';
import type { NotReadyError } from './not-ready-error.js';
import type { NotVisibleError } from './not-visible-error.js';
import type { OverrideError } from './override-error.js';
import type { PluginError } from './plugin-error.js';
import type { ProviderError } from './provider-error.js';
import type { RequestMissingError } from './request-missing-error.js';
import type { ScopeRequiredError } from './scope-required-error.js';

/** Maps each code to its class. A package adds its codes by augmentation. */
export interface NexusErrorByCode {
  NEXUS_BLUEPRINT_INVALID: BlueprintError;
  NEXUS_MISSING_PROVIDER: MissingProviderError;
  NEXUS_AMBIGUOUS_PROVIDER: AmbiguousProviderError;
  NEXUS_DUPLICATE_PROVIDER: DuplicateProviderError;
  NEXUS_INVALID_EXPORT: InvalidExportError;
  NEXUS_INVALID_PROVIDER: InvalidProviderError;
  NEXUS_INVALID_TOKEN: InvalidTokenError;
  NEXUS_INVALID_MODULE: InvalidModuleError;
  NEXUS_MISSING_DEPS: MissingDepsError;
  NEXUS_CIRCULAR_DEPENDENCY: CircularDependencyError;
  NEXUS_LIFETIME_VIOLATION: LifetimeError;
  NEXUS_MODULE_IMPORT_CYCLE: ModuleImportCycleError;
  NEXUS_MODULE_OPTIONS_MISSING: ModuleOptionsError;
  NEXUS_LOAD_GLOBAL_MODULE: LoadError;
  NEXUS_INVALID_MODULE_OPTIONS: ModuleOptionsError;
  NEXUS_PROVIDER_FAILED: ProviderError;
  NEXUS_NOT_READY: NotReadyError;
  NEXUS_ASYNC_TRANSIENT: AsyncTransientError;
  NEXUS_NOT_VISIBLE: NotVisibleError;
  NEXUS_SCOPE_REQUIRED: ScopeRequiredError;
  NEXUS_REQUEST_MISSING: RequestMissingError;
  NEXUS_LOADED_AFTER_SCOPE: LoadedAfterScopeError;
  NEXUS_NO_SCOPE_CONTEXT: NoScopeContextError;
  NEXUS_DISPOSED: DisposedError;
  NEXUS_LEGACY_DECORATORS: LegacyDecoratorsError;
  NEXUS_OVERRIDE_UNUSED: OverrideError;
  NEXUS_OVERRIDE_EXPORTS: OverrideError;
  NEXUS_PLUGIN_INVALID: PluginError;
  NEXUS_PLUGIN_VERSION: PluginError;
  NEXUS_PLUGIN_CONFLICT: PluginError;
  NEXUS_PLUGIN_FAILED: PluginError;
}

/**
 * True for an error any copy of NexusDI raised, narrowed to the class of
 * `code` when one is given. Works where instanceof cannot: across two copies
 * of core.
 */
export function isNexusError<C extends keyof NexusErrorByCode>(
  value: unknown,
  code?: C,
): value is NexusErrorByCode[C] {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[ERROR_BRAND] === true &&
    (code === undefined || (value as { code?: unknown }).code === code)
  );
}
