import {
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
  LazyAsyncError,
  LifetimeError,
  LoadedAfterScopeError,
  LoadError,
  MissingDepsError,
  MissingProviderError,
  ModuleImportCycleError,
  ModuleOptionsError,
  NotReadyError,
  NotVisibleError,
  PluginError,
  ProviderError,
  RequestMissingError,
  ScopeRequiredError,
  type NexusError,
  type NexusErrorCode,
} from '../src/errors/index.js';

export interface ErrorCase {
  readonly name: string;
  readonly error: NexusError;
  readonly code: NexusErrorCode;
  readonly fields: Readonly<Record<string, unknown>>;
  /** The error's Error.cause, for a class that carries one. */
  readonly cause?: unknown;
}

/** PluginError's fields, each null or empty, for a case to override. */
const NO_PLUGIN_FIELDS = {
  plugin: null,
  reason: null,
  detail: [],
  apiVersion: null,
  supported: [],
  plugins: [],
  target: null,
  hook: null,
  disposalErrors: [],
} as const;

/** InvalidTokenError's optional fields, each null or empty. */
const NO_TOKEN_SITE = {
  entry: null,
  module: null,
  index: null,
  reason: null,
  detail: [],
  otherCopy: false,
} as const;

const missing = new MissingProviderError({
  token: 'NavCharts',
  requester: 'ShipComputer',
  module: 'Engineering',
  entry: null,
  nearMisses: [{ kind: 'not-exported', module: 'Tactical' }],
});

export const errorCases: readonly ErrorCase[] = [
  {
    name: 'BlueprintError',
    error: new BlueprintError([missing]),
    code: 'NEXUS_BLUEPRINT_INVALID',
    fields: { errors: [missing] },
  },
  {
    name: 'MissingProviderError',
    error: missing,
    code: 'NEXUS_MISSING_PROVIDER',
    fields: {
      token: 'NavCharts',
      requester: 'ShipComputer',
      module: 'Engineering',
      nearMisses: [{ kind: 'not-exported', module: 'Tactical' }],
    },
  },
  {
    name: 'AmbiguousProviderError',
    error: new AmbiguousProviderError({
      token: 'Logger',
      module: 'Root',
      candidates: ['A', 'B'],
    }),
    code: 'NEXUS_AMBIGUOUS_PROVIDER',
    fields: { token: 'Logger', module: 'Root', candidates: ['A', 'B'] },
  },
  {
    name: 'DuplicateProviderError',
    error: new DuplicateProviderError({ token: 'Logger', module: 'Root' }),
    code: 'NEXUS_DUPLICATE_PROVIDER',
    fields: { token: 'Logger', module: 'Root' },
  },
  {
    name: 'InvalidExportError',
    error: new InvalidExportError({ token: 'Logger', module: 'Root' }),
    code: 'NEXUS_INVALID_EXPORT',
    fields: { token: 'Logger', module: 'Root' },
  },
  {
    name: 'InvalidProviderError',
    error: new InvalidProviderError({
      module: 'Root',
      index: 2,
      reason: 'not-a-provider',
      detail: ['null'],
      otherCopy: false,
    }),
    code: 'NEXUS_INVALID_PROVIDER',
    fields: {
      module: 'Root',
      index: 2,
      reason: 'not-a-provider',
      detail: ['null'],
      otherCopy: false,
    },
  },
  {
    name: 'InvalidTokenError',
    error: new InvalidTokenError({
      received: 'the number 3',
      ...NO_TOKEN_SITE,
    }),
    code: 'NEXUS_INVALID_TOKEN',
    fields: {
      received: 'the number 3',
      entry: null,
      module: null,
      index: null,
      reason: null,
      detail: [],
      otherCopy: false,
    },
  },
  {
    name: 'InvalidModuleError',
    error: new InvalidModuleError({
      received: 'undefined',
      path: ['Meridian', 'Tactical'],
      otherCopy: false,
    }),
    code: 'NEXUS_INVALID_MODULE',
    fields: {
      received: 'undefined',
      path: ['Meridian', 'Tactical'],
      otherCopy: false,
    },
  },
  {
    name: 'MissingDepsError',
    error: new MissingDepsError({
      token: 'ShipComputer',
      module: 'Engineering',
      arity: 1,
      useClass: null,
      bare: false,
    }),
    code: 'NEXUS_MISSING_DEPS',
    fields: { token: 'ShipComputer', module: 'Engineering', arity: 1 },
  },
  {
    name: 'CircularDependencyError',
    error: new CircularDependencyError({
      path: ['ShieldGrid', 'PowerRouter', 'ShieldGrid'],
    }),
    code: 'NEXUS_CIRCULAR_DEPENDENCY',
    fields: { path: ['ShieldGrid', 'PowerRouter', 'ShieldGrid'] },
  },
  {
    name: 'LifetimeError',
    error: new LifetimeError({
      path: ['ShipComputer', 'Mission'],
      lifetimes: ['singleton', 'scoped'],
    }),
    code: 'NEXUS_LIFETIME_VIOLATION',
    fields: {
      path: ['ShipComputer', 'Mission'],
      lifetimes: ['singleton', 'scoped'],
    },
  },
  {
    name: 'ModuleImportCycleError',
    error: new ModuleImportCycleError({ path: ['A', 'B', 'A'] }),
    code: 'NEXUS_MODULE_IMPORT_CYCLE',
    fields: { path: ['A', 'B', 'A'] },
  },
  {
    name: 'ModuleOptionsError (missing)',
    error: new ModuleOptionsError({
      code: 'NEXUS_MODULE_OPTIONS_MISSING',
      module: 'Comms',
      issues: [],
    }),
    code: 'NEXUS_MODULE_OPTIONS_MISSING',
    fields: { module: 'Comms', issues: [] },
  },
  {
    name: 'ModuleOptionsError (invalid)',
    error: new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: 'Comms',
      issues: [{ message: 'expected a number', path: ['frequency'] }],
    }),
    code: 'NEXUS_INVALID_MODULE_OPTIONS',
    fields: {
      module: 'Comms',
      issues: [{ message: 'expected a number', path: ['frequency'] }],
    },
  },
  {
    name: 'LoadError',
    error: new LoadError({ module: 'Telemetry' }),
    code: 'NEXUS_LOAD_GLOBAL_MODULE',
    fields: { module: 'Telemetry' },
  },
  {
    name: 'ProviderError',
    error: new ProviderError(
      {
        token: 'NavCharts',
        module: 'Tactical',
        path: ['NavCharts'],
        alsoFailed: [{ token: 'Sensors', module: 'Tactical', cause: 'down' }],
        disposalErrors: ['stuck'],
      },
      { cause: 'offline' },
    ),
    code: 'NEXUS_PROVIDER_FAILED',
    fields: {
      token: 'NavCharts',
      module: 'Tactical',
      path: ['NavCharts'],
      alsoFailed: [{ token: 'Sensors', module: 'Tactical', cause: 'down' }],
      disposalErrors: ['stuck'],
    },
    cause: 'offline',
  },
  {
    name: 'NotReadyError',
    error: new NotReadyError({
      owner: 'PowerRouter',
      target: 'ShieldGrid',
      path: [],
    }),
    code: 'NEXUS_NOT_READY',
    fields: { owner: 'PowerRouter', target: 'ShieldGrid', path: [] },
  },
  {
    name: 'AsyncTransientError',
    error: new AsyncTransientError({ token: 'Probe', module: 'Tactical' }),
    code: 'NEXUS_ASYNC_TRANSIENT',
    fields: { token: 'Probe', module: 'Tactical' },
  },
  {
    name: 'LazyAsyncError',
    error: new LazyAsyncError({ token: 'Charts', module: 'Navigation' }),
    code: 'NEXUS_LAZY_ASYNC',
    fields: { token: 'Charts', module: 'Navigation' },
  },
  {
    name: 'NotVisibleError',
    error: new NotVisibleError({
      token: 'SubspaceLink',
      owners: ['Comms'],
      entry: null,
    }),
    code: 'NEXUS_NOT_VISIBLE',
    fields: { token: 'SubspaceLink', owners: ['Comms'] },
  },
  {
    name: 'ScopeRequiredError',
    error: new ScopeRequiredError({
      token: 'Mission',
      path: ['Mission'],
      entry: null,
    }),
    code: 'NEXUS_SCOPE_REQUIRED',
    fields: { token: 'Mission', path: ['Mission'] },
  },
  {
    name: 'RequestMissingError',
    error: new RequestMissingError({ dependents: ['Mission'] }),
    code: 'NEXUS_REQUEST_MISSING',
    fields: { dependents: ['Mission'] },
  },
  {
    name: 'LoadedAfterScopeError',
    error: new LoadedAfterScopeError({
      token: 'Probe',
      module: 'Science',
      entry: null,
    }),
    code: 'NEXUS_LOADED_AFTER_SCOPE',
    fields: { token: 'Probe', module: 'Science' },
  },
  {
    name: 'DisposedError',
    error: new DisposedError({ target: 'container' }),
    code: 'NEXUS_DISPOSED',
    fields: { target: 'container' },
  },
  {
    name: 'PluginError',
    error: new PluginError({
      ...NO_PLUGIN_FIELDS,
      code: 'NEXUS_PLUGIN_INVALID',
      plugin: 'plugins[0]',
      reason: 'no-name',
    }),
    code: 'NEXUS_PLUGIN_INVALID',
    fields: { plugin: 'plugins[0]', reason: 'no-name', detail: [] },
  },
  {
    name: 'PluginError (version)',
    error: new PluginError({
      ...NO_PLUGIN_FIELDS,
      code: 'NEXUS_PLUGIN_VERSION',
      plugin: 'devtools',
      apiVersion: '2',
      supported: [1],
    }),
    code: 'NEXUS_PLUGIN_VERSION',
    fields: { plugin: 'devtools', apiVersion: '2', supported: [1] },
  },
  {
    name: 'PluginError (conflict)',
    error: new PluginError({
      ...NO_PLUGIN_FIELDS,
      code: 'NEXUS_PLUGIN_CONFLICT',
      plugins: ['devtools', 'federation'],
      target: 'NavCharts',
    }),
    code: 'NEXUS_PLUGIN_CONFLICT',
    fields: { plugins: ['devtools', 'federation'], target: 'NavCharts' },
  },
  {
    name: 'PluginError (failed)',
    error: new PluginError(
      {
        ...NO_PLUGIN_FIELDS,
        code: 'NEXUS_PLUGIN_FAILED',
        plugin: 'devtools',
        hook: 'observe',
        disposalErrors: [new Error('scram')],
      },
      { cause: new Error('offline') },
    ),
    code: 'NEXUS_PLUGIN_FAILED',
    fields: {
      plugin: 'devtools',
      hook: 'observe',
      disposalErrors: [new Error('scram')],
    },
    cause: new Error('offline'),
  },
];
