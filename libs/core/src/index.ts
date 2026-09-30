/// <reference lib="esnext.disposable" preserve="true" />
export {
  AmbiguousProviderError,
  AsyncTransientError,
  BlueprintError,
  CircularDependencyError,
  DisposedError,
  DOCS_URL,
  DuplicateProviderError,
  errorBase,
  InvalidExportError,
  InvalidModuleError,
  InvalidProviderError,
  InvalidTokenError,
  isNexusError,
  LazyAsyncError,
  LifetimeError,
  LoadedAfterScopeError,
  LoadError,
  MissingDepsError,
  MissingProviderError,
  ModuleImportCycleError,
  ModuleOptionsError,
  NexusError,
  NotReadyError,
  NotVisibleError,
  PluginError,
  ProviderError,
  RequestMissingError,
  ScopeRequiredError,
} from './errors/index.js';
export type {
  ErrorFields,
  ErrorLifetime,
  InvalidProviderReason,
  InvalidTokenReason,
  NearMiss,
  NexusErrorByCode,
  NexusErrorCode,
  NexusErrorOptions,
  PluginInvalidReason,
  ProviderFailure,
  SchemaIssue,
} from './errors/index.js';
export { displayName, MultiToken, Token } from './definitions/token.js';
export type { InjectionToken } from './definitions/token.js';
export { describeValue } from './definitions/describe.js';
export { isForeign } from './definitions/brand.js';
export type { Ctor, Lifetime } from './definitions/types.js';
export { all, lazy, optional } from './definitions/modifiers.js';
export type {
  All,
  Dep,
  DepFor,
  DepsMap,
  Lazy,
  Optional,
  Resolve,
  ResolveAll,
  ResolvedDeps,
  Tokens,
} from './definitions/modifiers.js';
export { provide } from './definitions/provide.js';
export type { Provider } from './definitions/provide.js';
export type {
  ProviderEntries,
  ProviderLiteral,
  UntypedFunctionMessage,
} from './definitions/provider-literal.js';
export type {
  DepsFor,
  FactoryDefinition,
  LazyAsyncMessage,
  NoLifetimeMessage,
  OverrideDefinition,
  PromiseTokenMessage,
} from './definitions/provide.js';
export {
  declareModuleClass,
  defineModule,
  resolveModuleRef as moduleDefinitionOf,
} from './definitions/define-module.js';
export { declareClass, declareProperty } from './definitions/metadata.js';
export type {
  ConfigurableModule,
  ConfigurableModuleConfig,
  ExportEntry,
  ForRootAsyncConfig,
  ModuleConfig,
  ModuleDefinition,
  ModuleRef,
  ProviderEntry,
} from './definitions/define-module.js';
export { REQUEST } from './definitions/request.js';
export type { NexusRequest } from './definitions/request.js';
export type { StandardSchemaV1 } from './definitions/standard-schema.js';
export { Nexus } from './runtime/nexus.js';
export type {
  CheckOptions,
  CreateOptions,
  LookupOptions,
} from './runtime/options.js';
export type {
  CheckedRoot,
  RootConfig,
  RootKeyMessage,
  RootRef,
  UninferredRoot,
} from './runtime/root.js';
export { NEXUS_PLUGIN_API, SUPPORTED_PLUGIN_APIS } from './runtime/plugins.js';
export type {
  CompilePluginHooks,
  ErrorText,
  NexusPlugin,
  PluginContext,
} from './runtime/plugins.js';
export type { Scope } from './runtime/scope.js';
export type { TraceEvent } from './runtime/trace.js';
export type {
  BlueprintView,
  CompileContext,
  EdgeView,
  ModuleView,
  ProviderRewrite,
  ProviderView,
} from './blueprint/views.js';
