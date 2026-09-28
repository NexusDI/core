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
  LegacyDecoratorsError,
  LifetimeError,
  LoadedAfterScopeError,
  LoadError,
  MissingDepsError,
  MissingProviderError,
  ModuleImportCycleError,
  ModuleOptionsError,
  NoScopeContextError,
  NotReadyError,
  NotVisibleError,
  OverrideError,
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
}

const missing = new MissingProviderError({
  token: 'NavCharts',
  requester: 'ShipComputer',
  module: 'Engineering',
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
    name: 'MissingProviderError (root get)',
    error: new MissingProviderError({
      token: 'NavCharts',
      requester: null,
      module: 'Meridian',
      nearMisses: [],
    }),
    code: 'NEXUS_MISSING_PROVIDER',
    fields: { requester: null, nearMisses: [] },
  },
  {
    name: 'MissingProviderError (deps entry)',
    error: new MissingProviderError({
      token: 'ReactorCore',
      requester: null,
      module: 'Meridian',
      nearMisses: [{ kind: 'not-imported', module: 'Engineering' }],
      entry: 'deps[1]',
    }),
    code: 'NEXUS_MISSING_PROVIDER',
    fields: { entry: 'deps[1]' },
  },
  {
    name: 'MissingProviderError (same description)',
    error: new MissingProviderError({
      token: 'NavCharts',
      requester: 'ShipComputer',
      module: 'Engineering',
      nearMisses: [{ kind: 'same-description', module: 'Tactical' }],
    }),
    code: 'NEXUS_MISSING_PROVIDER',
    fields: { nearMisses: [{ kind: 'same-description', module: 'Tactical' }] },
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
      reason:
        'is null, not a provider; list a class, a provide() result or a { token } literal',
    }),
    code: 'NEXUS_INVALID_PROVIDER',
    fields: {
      module: 'Root',
      index: 2,
      reason:
        'is null, not a provider; list a class, a provide() result or a { token } literal',
    },
  },
  {
    name: 'InvalidTokenError',
    error: new InvalidTokenError({ received: 'the number 3' }),
    code: 'NEXUS_INVALID_TOKEN',
    fields: {
      received: 'the number 3',
      entry: null,
      module: null,
      index: null,
    },
  },
  {
    name: 'InvalidTokenError (deps entry)',
    error: new InvalidTokenError({
      received: 'the string "nav"',
      entry: 'deps.name',
    }),
    code: 'NEXUS_INVALID_TOKEN',
    fields: { entry: 'deps.name' },
  },
  {
    name: 'InvalidTokenError (providers entry with reason)',
    error: new InvalidTokenError({
      received: 'the number 4',
      reason:
        'is not a token, so useExisting cannot alias it. A token is a class, a Token or a MultiToken.',
      module: 'Engineering',
      index: 2,
    }),
    code: 'NEXUS_INVALID_TOKEN',
    fields: { module: 'Engineering', index: 2 },
  },
  {
    name: 'InvalidTokenError in a providers entry',
    error: new InvalidTokenError({
      received: 'the number 3',
      module: 'Engineering',
      index: 2,
    }),
    code: 'NEXUS_INVALID_TOKEN',
    fields: {
      received: 'the number 3',
      entry: null,
      module: 'Engineering',
      index: 2,
      message:
        '[NEXUS_INVALID_TOKEN] Engineering.providers[2]: the number 3 is not a token. A token is a class, a Token or a MultiToken.',
    },
  },
  {
    name: 'InvalidModuleError',
    error: new InvalidModuleError({
      received: 'undefined',
      path: ['Meridian', 'Tactical'],
    }),
    code: 'NEXUS_INVALID_MODULE',
    fields: { received: 'undefined', path: ['Meridian', 'Tactical'] },
  },
  {
    name: 'InvalidModuleError (import path)',
    error: new InvalidModuleError({
      received: 'the number 4',
      path: ['Meridian', 'Tactical'],
    }),
    code: 'NEXUS_INVALID_MODULE',
    fields: { path: ['Meridian', 'Tactical'] },
  },
  {
    name: 'MissingDepsError',
    error: new MissingDepsError({
      token: 'ShipComputer',
      module: 'Engineering',
      arity: 1,
    }),
    code: 'NEXUS_MISSING_DEPS',
    fields: { token: 'ShipComputer', module: 'Engineering', arity: 1 },
  },
  {
    name: 'MissingDepsError (bare)',
    error: new MissingDepsError({
      token: 'Drone',
      module: 'Bay',
      arity: 2,
      useClass: null,
      bare: true,
    }),
    code: 'NEXUS_MISSING_DEPS',
    fields: { arity: 2 },
  },
  {
    name: 'MissingDepsError (useClass)',
    error: new MissingDepsError({
      token: 'NavCharts',
      module: 'Engineering',
      arity: 1,
      useClass: 'Bare',
    }),
    code: 'NEXUS_MISSING_DEPS',
    fields: { useClass: 'Bare' },
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
    name: 'LifetimeError (empty path)',
    error: new LifetimeError({ path: [], lifetimes: [] }),
    code: 'NEXUS_LIFETIME_VIOLATION',
    fields: { path: [], lifetimes: [] },
  },
  {
    name: 'LifetimeError (alias step)',
    error: new LifetimeError({
      path: ['ShipComputer', 'MissionAlias', 'Mission'],
      lifetimes: ['singleton', null, 'scoped'],
    }),
    code: 'NEXUS_LIFETIME_VIOLATION',
    fields: {
      path: ['ShipComputer', 'MissionAlias', 'Mission'],
      lifetimes: ['singleton', null, 'scoped'],
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
    name: 'ModuleOptionsError (invalid options)',
    error: new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: 'Comms',
      issues: [
        { message: 'Expected number', path: ['frequency'] },
        { message: 'Unknown key' },
      ],
    }),
    code: 'NEXUS_INVALID_MODULE_OPTIONS',
    fields: { module: 'Comms' },
  },
  {
    name: 'ModuleOptionsError (issue with a key path segment)',
    error: new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: 'Comms',
      issues: [{ message: 'Expected number', path: [{ key: 'frequency' }] }],
    }),
    code: 'NEXUS_INVALID_MODULE_OPTIONS',
    fields: { module: 'Comms' },
  },
  {
    name: 'LoadError',
    error: new LoadError({ module: 'Telemetry' }),
    code: 'NEXUS_LOAD_GLOBAL_MODULE',
    fields: { module: 'Telemetry' },
  },
  {
    name: 'ProviderError (path, also failed, disposal errors)',
    error: new ProviderError({
      token: 'NavCharts',
      module: 'Tactical',
      path: ['Bridge', 'NavCharts'],
      cause: new Error('offline'),
      alsoFailed: [
        { token: 'SubspaceLink', module: 'Comms', cause: new Error('x') },
      ],
      disposalErrors: [new Error('scram')],
    }),
    code: 'NEXUS_PROVIDER_FAILED',
    fields: { path: ['Bridge', 'NavCharts'] },
  },
  {
    name: 'ProviderError',
    error: new ProviderError({
      token: 'NavCharts',
      module: 'Tactical',
      path: ['NavCharts'],
      cause: 'offline',
      alsoFailed: [{ token: 'Sensors', module: 'Tactical', cause: 'down' }],
      disposalErrors: ['stuck'],
    }),
    code: 'NEXUS_PROVIDER_FAILED',
    fields: {
      token: 'NavCharts',
      module: 'Tactical',
      path: ['NavCharts'],
      cause: 'offline',
      alsoFailed: [{ token: 'Sensors', module: 'Tactical', cause: 'down' }],
      disposalErrors: ['stuck'],
    },
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
    name: 'NotReadyError (runtime cycle)',
    error: new NotReadyError({
      owner: 'PowerRouter',
      target: 'ShieldGrid',
      path: ['PowerRouter', 'ShieldGrid'],
    }),
    code: 'NEXUS_NOT_READY',
    fields: {
      owner: 'PowerRouter',
      target: 'ShieldGrid',
      path: ['PowerRouter', 'ShieldGrid'],
    },
  },
  {
    name: 'AsyncTransientError',
    error: new AsyncTransientError({ token: 'Probe', module: 'Tactical' }),
    code: 'NEXUS_ASYNC_TRANSIENT',
    fields: { token: 'Probe', module: 'Tactical' },
  },
  {
    name: 'NotVisibleError',
    error: new NotVisibleError({ token: 'SubspaceLink', owners: ['Comms'] }),
    code: 'NEXUS_NOT_VISIBLE',
    fields: { token: 'SubspaceLink', owners: ['Comms'] },
  },
  {
    name: 'NotVisibleError (no owners)',
    error: new NotVisibleError({ token: 'SubspaceLink', owners: [] }),
    code: 'NEXUS_NOT_VISIBLE',
    fields: { token: 'SubspaceLink', owners: [] },
  },
  {
    name: 'ScopeRequiredError',
    error: new ScopeRequiredError({ token: 'Mission', path: ['Mission'] }),
    code: 'NEXUS_SCOPE_REQUIRED',
    fields: { token: 'Mission', path: ['Mission'] },
  },
  {
    name: 'ScopeRequiredError (deps entry)',
    error: new ScopeRequiredError({
      token: 'Mission',
      path: ['Mission'],
      entry: 'deps[0]',
    }),
    code: 'NEXUS_SCOPE_REQUIRED',
    fields: { token: 'Mission', path: ['Mission'], entry: 'deps[0]' },
  },
  {
    name: 'ScopeRequiredError (reached through a path)',
    error: new ScopeRequiredError({
      token: 'Mission',
      path: ['Bridge', 'Mission'],
    }),
    code: 'NEXUS_SCOPE_REQUIRED',
    fields: { token: 'Mission', path: ['Bridge', 'Mission'] },
  },
  {
    name: 'RequestMissingError',
    error: new RequestMissingError({ dependents: ['Mission'] }),
    code: 'NEXUS_REQUEST_MISSING',
    fields: { dependents: ['Mission'] },
  },
  {
    name: 'RequestMissingError (many dependents)',
    error: new RequestMissingError({ dependents: ['Mission', 'Comms'] }),
    code: 'NEXUS_REQUEST_MISSING',
    fields: { dependents: ['Mission', 'Comms'] },
  },
  {
    name: 'LoadedAfterScopeError',
    error: new LoadedAfterScopeError({ token: 'Probe', module: 'Science' }),
    code: 'NEXUS_LOADED_AFTER_SCOPE',
    fields: { token: 'Probe', module: 'Science' },
  },
  {
    name: 'LoadedAfterScopeError (deps entry)',
    error: new LoadedAfterScopeError({
      token: 'Probe',
      module: 'Science',
      entry: 'deps[0]',
    }),
    code: 'NEXUS_LOADED_AFTER_SCOPE',
    fields: { token: 'Probe', module: 'Science', entry: 'deps[0]' },
  },
  {
    name: 'NoScopeContextError',
    error: new NoScopeContextError(),
    code: 'NEXUS_NO_SCOPE_CONTEXT',
    fields: {},
  },
  {
    name: 'DisposedError',
    error: new DisposedError({ target: 'container' }),
    code: 'NEXUS_DISPOSED',
    fields: { target: 'container' },
  },
  {
    name: 'LegacyDecoratorsError',
    error: new LegacyDecoratorsError({ decorator: 'Injectable' }),
    code: 'NEXUS_LEGACY_DECORATORS',
    fields: { decorator: 'Injectable' },
  },
  {
    name: 'OverrideError (unused)',
    error: new OverrideError({
      code: 'NEXUS_OVERRIDE_UNUSED',
      token: 'NavCharts',
    }),
    code: 'NEXUS_OVERRIDE_UNUSED',
    fields: { token: 'NavCharts', module: null, missing: [] },
  },
  {
    name: 'OverrideError (exports)',
    error: new OverrideError({
      code: 'NEXUS_OVERRIDE_EXPORTS',
      module: 'Comms',
      missing: ['SubspaceLink'],
    }),
    code: 'NEXUS_OVERRIDE_EXPORTS',
    fields: { token: null, module: 'Comms', missing: ['SubspaceLink'] },
  },
  {
    name: 'PluginError',
    error: new PluginError({
      code: 'NEXUS_PLUGIN_INVALID',
      plugin: 'devtools',
      reason: 'no-name',
    }),
    code: 'NEXUS_PLUGIN_INVALID',
    fields: { plugin: 'devtools', reason: 'no-name', detail: [] },
  },
  {
    name: 'PluginError (version)',
    error: new PluginError({
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
      code: 'NEXUS_PLUGIN_CONFLICT',
      plugins: ['devtools', 'federation'],
      target: 'NavCharts',
    }),
    code: 'NEXUS_PLUGIN_CONFLICT',
    fields: { plugins: ['devtools', 'federation'], target: 'NavCharts' },
  },
  {
    name: 'PluginError (failed)',
    error: new PluginError({
      code: 'NEXUS_PLUGIN_FAILED',
      plugin: 'devtools',
      hook: 'observe',
      cause: new Error('offline'),
      disposalErrors: [new Error('scram')],
    }),
    code: 'NEXUS_PLUGIN_FAILED',
    fields: {
      plugin: 'devtools',
      hook: 'observe',
      disposalErrors: [new Error('scram')],
    },
  },
];
