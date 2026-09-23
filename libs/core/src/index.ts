/// <reference lib="esnext.disposable" preserve="true" />
export {
  AmbiguousProviderError,
  AsyncTransientError,
  BlueprintError,
  CircularDependencyError,
  DisposedError,
  DuplicateProviderError,
  InvalidExportError,
  InvalidModuleError,
  InvalidProviderError,
  InvalidTokenError,
  LegacyDecoratorsError,
  LifetimeError,
  LoadedAfterScopeError,
  LoadError,
  MissingDepsError,
  MissingProviderError,
  ModuleImportCycleError,
  ModuleOptionsError,
  NexusError,
  NoScopeContextError,
  NotReadyError,
  NotVisibleError,
  OverrideError,
  ProviderError,
  RequestMissingError,
  ScopeRequiredError,
} from './errors/index.js';
export type {
  ErrorLifetime,
  NearMiss,
  NexusErrorCode,
  ProviderFailure,
  SchemaIssue,
} from './errors/index.js';
export { MultiToken, Token } from './definitions/token.js';
export type { InjectionToken } from './definitions/token.js';
export type { Lifetime } from './definitions/types.js';
export { all, lazy, optional } from './definitions/modifiers.js';
export type {
  All,
  Dep,
  DepFor,
  Lazy,
  Optional,
  Resolve,
  ResolveAll,
  Tokens,
} from './definitions/modifiers.js';
