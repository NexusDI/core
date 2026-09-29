import type {
  AmbiguousProviderError,
  AsyncTransientError,
  BlueprintView,
  CircularDependencyError,
  DisposedError,
  DuplicateProviderError,
  ErrorText,
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
  NearMiss,
  NotReadyError,
  NotVisibleError,
  PluginError,
  PluginInvalidReason,
  ProviderError,
  RequestMissingError,
  ScopeRequiredError,
  SchemaIssue,
} from '@nexusdi/core';

import { describeThrown } from './describe-thrown.js';
import { PROVIDER_REASONS, tokenReason } from './reasons.js';

// Each builder is revision 1's message code for its class, reading the
// error's fields where revision 1 read its constructor input. `message` is
// the whole body after `[CODE] `, so revision 1's layout holds exactly.

type Builder<E> = (error: E, view: BlueprintView | undefined) => ErrorText;

const text = (message: string): ErrorText => ({ message });

function nearMissHint(token: string, module: string, miss: NearMiss): string {
  switch (miss.kind) {
    case 'not-exported':
      return `${token} is provided in ${miss.module}, which does not export it.`;
    case 'not-imported':
      return `${token} is exported by ${miss.module}, which ${module} does not import.`;
    case 'same-description':
      return `A Token with the same description '${token}' exists in ${miss.module}. Tokens compare by identity, so use that Token object.`;
  }
}

function nearMissFix(
  token: string,
  module: string,
  misses: readonly NearMiss[],
): string {
  const first = misses[0];
  if (first?.kind === 'not-exported') {
    return `add ${token} to ${first.module}'s exports and import ${first.module} into ${module}.`;
  }
  if (first?.kind === 'not-imported')
    return `import ${first.module} into ${module}.`;
  return `provide ${token} in ${module} or in a module ${module} imports.`;
}

/**
 * `nearMisses` is the search explain() ran over a view. Without one the
 * builder reads the error's own field, so a constructed error renders the
 * near misses it was built with.
 */
const missingProvider = (
  error: MissingProviderError,
  _view: BlueprintView | undefined,
  nearMisses: readonly NearMiss[] = error.nearMisses,
): ErrorText => {
  const { token, requester, module, entry } = error;
  const head =
    entry !== null
      ? `${entry}: no provider of ${token} is visible in ${module}.`
      : requester === null
        ? `get(${token}) found no provider of ${token} visible in ${module}.`
        : `${requester} (module ${module}) depends on ${token}, but no provider of ${token} is visible in ${module}.`;
  return text(
    [
      head,
      ...nearMisses.map((miss) => `  ${nearMissHint(token, module, miss)}`),
      `  Fix: ${nearMissFix(token, module, nearMisses)}`,
    ].join('\n'),
  );
};

const ambiguousProvider: Builder<AmbiguousProviderError> = (error) =>
  text(
    `${error.module} sees ${error.token} from ${error.candidates.join(' and ')}, and they provide different instances.\n` +
      `  Fix: export ${error.token} from one of them only, or provide ${error.token} in ${error.module}, which shadows the imports.`,
  );

const duplicateProvider: Builder<DuplicateProviderError> = (error) =>
  text(
    `${error.module} provides ${error.token} twice.\n  Fix: remove one of them, or use a MultiToken to collect several.`,
  );

const invalidExport: Builder<InvalidExportError> = (error) =>
  text(
    `${error.module} exports ${error.token}, which it neither provides nor sees through an import.\n` +
      `  Fix: provide ${error.token} in ${error.module}, or import the module that exports it.`,
  );

/** A detail that names a factory, such as `(the with() factory)`, leads the sentence. */
function isFactoryPrefix(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.startsWith('(the ') &&
    value.endsWith(' factory)')
  );
}

const invalidProvider: Builder<InvalidProviderError> = (error) => {
  const [first, ...rest] = error.detail;
  const prefixed = isFactoryPrefix(first);
  const sentence = PROVIDER_REASONS[error.reason](
    prefixed ? rest : error.detail,
  );
  return text(
    `${error.module}.providers[${error.index}] ${prefixed ? `${first} ` : ''}${sentence}.`,
  );
};

const invalidToken: Builder<InvalidTokenError> = (error) => {
  const at =
    error.entry ??
    (error.module === null || error.index === null
      ? undefined
      : `${error.module}.providers[${error.index}]`);
  return text(
    `${at === undefined ? '' : `${at}: `}${error.received} ${tokenReason(error.reason, error.detail)}`,
  );
};

const invalidModule: Builder<InvalidModuleError> = (error) => {
  const where =
    error.path.length > 0 ? ` (imported by ${error.path.join(' → ')})` : '';
  return text(
    `${error.received} is not a module${where}.\n  Fix: create one with defineModule(), or decorate a class with @Module.`,
  );
};

const missingDeps: Builder<MissingDepsError> = (error) => {
  const { useClass } = error;
  const s = error.arity === 1 ? '' : 's';
  const cls = useClass ?? error.token;
  const subject =
    useClass === null ? cls : `${useClass} (useClass for ${error.token})`;
  const declare = `declare static deps = [...] as const on ${cls}`;
  const decorate = 'decorate it with @Injectable({ deps })';
  // Each form reads deps from different places (spec §3.2), so each gets
  // only the fixes that form reads.
  const fix =
    useClass !== null
      ? `add deps to the binding, ${declare}, or ${decorate}.`
      : error.bare
        ? `${declare}, ${decorate}, or list provide(${cls}, { deps: [...] }) in providers.`
        : `add deps to the binding, or ${declare}. A binding of a class to itself does not read @Injectable deps.`;
  return text(
    `${subject} in ${error.module} takes ${error.arity} constructor parameter${s} and has no deps.\n` +
      `  Fix: ${fix}`,
  );
};

const circularDependency: Builder<CircularDependencyError> = (error) => {
  const [from = '?', to = '?'] = error.path;
  return text(
    `${error.path.join(' → ')} is a dependency cycle.\n` +
      `  Fix: wrap one edge in lazy(), for example the dependency of ${from} on ${to}: lazy(${to}).`,
  );
};

const lifetime: Builder<LifetimeError> = (error) => {
  const steps = error.path
    .map((name, i) => `${name} (${error.lifetimes[i] ?? 'alias'})`)
    .join(' → ');
  const first = error.path[0] ?? '?';
  return text(
    `${first} is a singleton and captures a scoped provider: ${steps}. A singleton outlives every scope.\n` +
      `  Fix: make ${first} scoped, or move the scoped dependency out of its dependency chain.`,
  );
};

const moduleImportCycle: Builder<ModuleImportCycleError> = (error) =>
  text(
    `${error.path.join(' → ')} is a module import cycle.\n  Fix: move the shared providers into a module that both import.`,
  );

function issueWhere(issue: SchemaIssue): string {
  if (!issue.path || issue.path.length === 0) return '';
  const keys = issue.path.map((segment) =>
    String(typeof segment === 'object' ? segment.key : segment),
  );
  return `${keys.join('.')}: `;
}

const moduleOptions: Builder<ModuleOptionsError> = (error) =>
  text(
    error.code === 'NEXUS_MODULE_OPTIONS_MISSING'
      ? `${error.module} is configurable and was imported without with().\n  Fix: import ${error.module}.with(options).`
      : `${error.module}.with() received options its schema rejects:\n${error.issues.map((issue) => `  ${issueWhere(issue)}${issue.message}`).join('\n')}`,
  );

const load: Builder<LoadError> = (error) =>
  text(
    `${error.module} is global and cannot be loaded after startup, because every module's bindings are already computed.\n` +
      `  Fix: import ${error.module} from the root module, or make it non-global.`,
  );

const provider: Builder<ProviderError> = (error) => {
  const lines = [
    `${error.token} (module ${error.module}) failed: ${describeThrown(error.cause)}`,
  ];
  if (error.path.length > 1)
    lines.push(`  While building: ${error.path.join(' → ')}`);
  if (error.alsoFailed.length > 0)
    lines.push(
      `  Also failed in the same level: ${error.alsoFailed.map((f) => f.token).join(', ')}`,
    );
  if (error.disposalErrors.length > 0)
    lines.push(
      `  ${error.disposalErrors.length} disposer(s) threw during cleanup; see disposalErrors.`,
    );
  return text(lines.join('\n'));
};

const notReady: Builder<NotReadyError> = (error) => {
  const cycle =
    error.path.length > 0 ? `\n  Runtime cycle: ${error.path.join(' → ')}` : '';
  return text(
    `${error.owner} called its lazy(${error.target}) thunk before ${error.target} was ready.${cycle}\n` +
      `  Fix: call the thunk after startup, from a method, and not from a constructor, a factory's continuation or onInit.`,
  );
};

const asyncTransient: Builder<AsyncTransientError> = (error) =>
  text(
    `${error.token} (module ${error.module}) is transient and its factory returned a promise. get() is synchronous and cannot wait for it.\n` +
      `  Fix: use lifetime: 'scoped', or make the token a function type and provide () => Promise<T>.`,
  );

/** `deps[0]: ` for an error about a deps entry, or nothing. */
const entryPrefix = (entry: string | null): string =>
  entry === null ? '' : `${entry}: `;

const notVisible: Builder<NotVisibleError> = (error) => {
  const owner = error.owners[0] ?? '?';
  return text(
    `${entryPrefix(error.entry)}${error.token} is provided in ${error.owners.join(', ')}, and the lookup module cannot see it.\n` +
      `  Fix: export it along a path to the root module, or call get(${error.token}, { module: ${owner} }).`,
  );
};

const scopeRequired: Builder<ScopeRequiredError> = (error) => {
  const via =
    error.path.length > 1
      ? ` It was reached through ${error.path.join(' → ')}.`
      : '';
  return text(
    `${entryPrefix(error.entry)}${error.token} is scoped, and the root container has no scope.${via}\n` +
      `  Fix: resolve it from a scope: const scope = await ship.createScope(); scope.get(${error.token}).`,
  );
};

const requestMissing: Builder<RequestMissingError> = (error) => {
  const verb = error.dependents.length === 1 ? 'depends' : 'depend';
  return text(
    `createScope() received no request, and ${error.dependents.join(', ')} ${verb} on REQUEST.\n  Fix: pass createScope({ request }).`,
  );
};

const loadedAfterScope: Builder<LoadedAfterScopeError> = (error) =>
  text(
    `${entryPrefix(error.entry)}${error.token} comes from ${error.module}, which was loaded after this scope was created. A scope resolves against the graph current at its creation.\n` +
      `  Fix: create a new scope.`,
  );

const DISPOSED = {
  container: 'the container is disposed or disposing',
  scope: 'the scope is disposed',
  instance: 'the lazy() target was already disposed',
} as const;

const disposed: Builder<DisposedError> = (error) =>
  text(`${DISPOSED[error.target]}.`);

const legacyDecorators: Builder<LegacyDecoratorsError> = (error) =>
  text(
    `@${error.decorator} was called as a legacy decorator, and NexusDI's decorators are standard (TC39) decorators.\n` +
      '  Fix: remove experimentalDecorators from tsconfig, or register the class with provide() and defineModule().',
  );

const PLUGIN_INVALID: Record<PluginInvalidReason, (detail: string) => string> =
  {
    'not-an-array': (d) => `is ${d}; plugins takes an array of plugin objects.`,
    'not-an-object': (d) =>
      `is ${d}; a plugin is an object with a name and an apiVersion.`,
    'no-name': () => 'has no name; set name to a non-empty string.',
    'duplicate-name': () =>
      'has the name of an earlier plugin; each plugin needs its own name.',
    'bad-hook': (d) => `has a ${d} hook that is not a function.`,
    'bad-compile': () =>
      'has a compile that is not an object of module, provider and check functions.',
    'bad-modules': () => 'has modules that are not an array of modules.',
    'bad-on-init': (d) =>
      `sets onInit to ${d}; the one accepted value is false.`,
  };

const plugin: Builder<PluginError> = (error) => {
  switch (error.code) {
    case 'NEXUS_PLUGIN_INVALID':
      return text(
        `${error.plugin} ${PLUGIN_INVALID[error.reason as PluginInvalidReason](error.detail.join(', '))}`,
      );
    case 'NEXUS_PLUGIN_VERSION':
      return text(
        `${error.plugin} was written for plugin API ${error.apiVersion}; this @nexusdi/core supports ${error.supported.join(', ')}.\n  Fix: install the plugin version built for this @nexusdi/core.`,
      );
    case 'NEXUS_PLUGIN_CONFLICT':
      return text(
        `${error.plugins.join(' and ')} both rewrite ${error.target}; one plugin may rewrite a module or a provider.`,
      );
    case 'NEXUS_PLUGIN_FAILED':
      return text(
        `the ${error.hook} hook of ${error.plugin} failed: ${describeThrown(error.cause)}`,
      );
  }
};

/**
 * The builder of each code but NEXUS_BLUEPRINT_INVALID, which renders its
 * inner errors and so sits beside explain() in explain.ts.
 */
export const BUILDERS = {
  NEXUS_MISSING_PROVIDER: missingProvider,
  NEXUS_AMBIGUOUS_PROVIDER: ambiguousProvider,
  NEXUS_DUPLICATE_PROVIDER: duplicateProvider,
  NEXUS_INVALID_EXPORT: invalidExport,
  NEXUS_INVALID_PROVIDER: invalidProvider,
  NEXUS_INVALID_TOKEN: invalidToken,
  NEXUS_INVALID_MODULE: invalidModule,
  NEXUS_MISSING_DEPS: missingDeps,
  NEXUS_CIRCULAR_DEPENDENCY: circularDependency,
  NEXUS_LIFETIME_VIOLATION: lifetime,
  NEXUS_MODULE_IMPORT_CYCLE: moduleImportCycle,
  NEXUS_MODULE_OPTIONS_MISSING: moduleOptions,
  NEXUS_LOAD_GLOBAL_MODULE: load,
  NEXUS_INVALID_MODULE_OPTIONS: moduleOptions,
  NEXUS_PROVIDER_FAILED: provider,
  NEXUS_NOT_READY: notReady,
  NEXUS_ASYNC_TRANSIENT: asyncTransient,
  NEXUS_NOT_VISIBLE: notVisible,
  NEXUS_SCOPE_REQUIRED: scopeRequired,
  NEXUS_REQUEST_MISSING: requestMissing,
  NEXUS_LOADED_AFTER_SCOPE: loadedAfterScope,
  NEXUS_DISPOSED: disposed,
  NEXUS_LEGACY_DECORATORS: legacyDecorators,
  NEXUS_PLUGIN_INVALID: plugin,
  NEXUS_PLUGIN_VERSION: plugin,
  NEXUS_PLUGIN_CONFLICT: plugin,
  NEXUS_PLUGIN_FAILED: plugin,
};
