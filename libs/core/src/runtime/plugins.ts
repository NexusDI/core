import type { ProviderRecord } from '../blueprint/blueprint.js';
import {
  NO_COMPILE_HOOKS,
  type CompileHooks,
  type Hook,
} from '../blueprint/hooks.js';
import {
  viewOfBlueprint,
  type BlueprintView,
  type CompileContext,
  type ProviderRewrite,
  type ProviderView,
} from '../blueprint/views.js';
import type {
  ModuleDefinition,
  ModuleRef,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import type { NearMiss } from '../errors/index.js';
import {
  BlueprintError,
  PluginError,
  type NexusError,
  type PluginInvalidReason,
} from '../errors/index.js';
import { formatThrown } from './format.js';
import type { Nexus } from './nexus.js';
import type { RootState } from './state.js';
import type { TraceEvent } from './trace.js';

/** The plugin API version this core implements. */
export const NEXUS_PLUGIN_API = 1;
/** Every plugin API version this core accepts. */
export const SUPPORTED_PLUGIN_APIS: readonly number[] = Object.freeze([1]);

export interface CompilePluginHooks {
  module?(
    module: ModuleDefinition,
    context: CompileContext,
  ): ModuleRef | undefined;
  provider?(
    provider: ProviderView,
    context: CompileContext,
  ): ProviderRewrite | undefined;
  check?(view: BlueprintView, report: (error: NexusError) => void): void;
}

export interface ErrorText {
  readonly message: string;
  readonly hints?: readonly string[];
  readonly fix?: string;
  readonly nearMisses?: readonly NearMiss[];
}

export interface PluginContext {
  readonly container: Nexus;
  /** The current blueprint's view: one frozen object per published blueprint. A load() that changes the graph publishes a new one. */
  blueprint(): BlueprintView;
  /** Whether the last build of factory `providerId` in this container, root or any scope, returned a thenable. null for other providers and before the first build. */
  builtAsync(providerId: string): boolean | null;
}

/** Extends one container. Every hook is optional (spec §3.10). */
export interface NexusPlugin {
  readonly name: string;
  readonly apiVersion: number;
  readonly modules?: readonly ModuleRef[];
  readonly onInit?: false;
  readonly compile?: CompilePluginHooks;
  construct?(
    instance: unknown,
    provider: ProviderView,
    scope: string | null,
  ): unknown;
  observe?(event: TraceEvent): void;
  formatError?(
    error: NexusError,
    view: BlueprintView | undefined,
  ): ErrorText | undefined;
  setup?(context: PluginContext): void | PromiseLike<void>;
  dispose?(): void | PromiseLike<void>;
}

type Fn = (...args: never[]) => unknown;

/** A hook with its plugin's position in the plugins array. */
export interface PluginHook<F> extends Hook<F> {
  readonly index: number;
}

/** A container's plugins, split into per-hook arrays in plugin order. */
export interface PluginSet {
  /** How many plugins the container registered. */
  readonly count: number;
  readonly modules: readonly unknown[];
  readonly onInit: boolean;
  readonly compile: CompileHooks;
  readonly construct: readonly Hook<
    (instance: unknown, provider: ProviderView, scope: string | null) => unknown
  >[];
  readonly observe: readonly Hook<(event: TraceEvent) => void>[];
  readonly formatError: readonly Hook<
    (error: NexusError, view: BlueprintView | undefined) => unknown
  >[];
  readonly setup: readonly PluginHook<(context: PluginContext) => unknown>[];
  readonly dispose: readonly PluginHook<() => unknown>[];
}

const FUNCTION_HOOKS = [
  'construct',
  'observe',
  'formatError',
  'setup',
  'dispose',
] as const;
const COMPILE_HOOKS = ['module', 'provider', 'check'] as const;
type HookKey = (typeof FUNCTION_HOOKS)[number] | (typeof COMPILE_HOOKS)[number];

export const NO_PLUGINS: PluginSet = Object.freeze({
  count: 0,
  modules: Object.freeze([]),
  onInit: true,
  compile: NO_COMPILE_HOOKS,
  construct: Object.freeze([]),
  observe: Object.freeze([]),
  formatError: Object.freeze([]),
  setup: Object.freeze([]),
  dispose: Object.freeze([]),
});

function take(owner: object, key: string): unknown {
  return Object.hasOwn(owner, key)
    ? (owner as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Validates `plugins` and splits it into per-hook arrays. Reads own
 * properties only (SEC-003), once, so a hook added to a plugin later is never
 * called. Throws one BlueprintError holding every fault.
 */
export function registerPlugins(input: unknown): PluginSet {
  if (input === undefined) return NO_PLUGINS;
  const errors: NexusError[] = [];
  const invalid = (
    plugin: string,
    reason: PluginInvalidReason,
    detail: readonly string[] = [],
  ): void => {
    errors.push(
      new PluginError({
        code: 'NEXUS_PLUGIN_INVALID',
        plugin,
        reason,
        detail,
        apiVersion: null,
        supported: [],
        plugins: [],
        target: null,
        hook: null,
        disposalErrors: [],
      }),
    );
  };
  if (!Array.isArray(input)) {
    invalid('plugins', 'not-an-array', [describeValue(input)]);
    throw new BlueprintError(errors);
  }

  const modules: unknown[] = [];
  const hooks = {
    module: [] as PluginHook<never>[],
    provider: [] as PluginHook<never>[],
    check: [] as PluginHook<never>[],
    construct: [] as PluginHook<never>[],
    observe: [] as PluginHook<never>[],
    formatError: [] as PluginHook<never>[],
    setup: [] as PluginHook<never>[],
    dispose: [] as PluginHook<never>[],
  };
  let onInit = true;
  const names = new Set<string>();

  for (let index = 0; index < input.length; index++) {
    const at = `plugins[${index}]`;
    const candidate: unknown = input[index];
    if (typeof candidate !== 'object' || candidate === null) {
      invalid(at, 'not-an-object', [describeValue(candidate)]);
      continue;
    }
    const name = take(candidate, 'name');
    if (typeof name !== 'string' || name === '') {
      invalid(at, 'no-name');
      continue;
    }
    if (names.has(name)) {
      invalid(name, 'duplicate-name');
      continue;
    }
    names.add(name);

    const apiVersion = take(candidate, 'apiVersion');
    if (
      typeof apiVersion !== 'number' ||
      !SUPPORTED_PLUGIN_APIS.includes(apiVersion)
    ) {
      errors.push(
        new PluginError({
          code: 'NEXUS_PLUGIN_VERSION',
          plugin: name,
          reason: null,
          detail: [],
          apiVersion: String(apiVersion),
          supported: SUPPORTED_PLUGIN_APIS,
          plugins: [],
          target: null,
          hook: null,
          disposalErrors: [],
        }),
      );
      continue;
    }

    const before = errors.length;

    // Read each own hook key exactly once, so a getter is never read twice:
    // once here to validate, once again to register.
    const records: (readonly [key: HookKey, owner: object, fn: Fn])[] = [];
    for (const key of FUNCTION_HOOKS) {
      const fn = take(candidate, key);
      if (fn === undefined) continue;
      if (typeof fn !== 'function') invalid(name, 'bad-hook', [key]);
      else records.push([key, candidate, fn as Fn]);
    }

    const initFlag = take(candidate, 'onInit');
    if (initFlag !== undefined && initFlag !== false)
      invalid(name, 'bad-on-init', [describeValue(initFlag)]);

    const compile = take(candidate, 'compile');
    if (compile !== undefined) {
      if (typeof compile !== 'object' || compile === null) {
        invalid(name, 'bad-compile');
      } else {
        let compileOk = true;
        for (const key of COMPILE_HOOKS) {
          const fn = take(compile, key);
          if (fn === undefined) continue;
          if (typeof fn !== 'function') compileOk = false;
          else records.push([key, compile, fn as Fn]);
        }
        if (!compileOk) invalid(name, 'bad-compile');
      }
    }

    const pluginModules = take(candidate, 'modules');
    if (pluginModules !== undefined && !Array.isArray(pluginModules))
      invalid(name, 'bad-modules');

    if (errors.length > before) continue;

    for (const [key, owner, fn] of records) {
      hooks[key].push({
        plugin: name,
        index,
        call: ((...args: never[]) => fn.apply(owner, args)) as never,
      });
    }
    if (initFlag === false) onInit = false;
    if (Array.isArray(pluginModules)) modules.push(...pluginModules);
  }
  // The plugins that passed validation format the faults, with no view:
  // nothing has compiled yet (spec §9.1).
  if (errors.length > 0)
    throw formatThrown(
      { formatError: hooks.formatError },
      () => undefined,
      new BlueprintError(errors),
    );

  return Object.freeze({
    count: input.length,
    modules: Object.freeze(modules),
    onInit,
    compile: Object.freeze(
      Object.fromEntries(
        COMPILE_HOOKS.map((key) => [key, Object.freeze(hooks[key])]),
      ),
    ),
    ...Object.fromEntries(
      FUNCTION_HOOKS.map((key) => [key, Object.freeze(hooks[key])]),
    ),
  }) as unknown as PluginSet;
}

/**
 * Whether a factory's last build returned a thenable. A transient factory is
 * synchronous by contract, so it reports false until a get() finds a
 * thenable (NEXUS_ASYNC_TRANSIENT). A singleton or scoped factory reports
 * null before its first build.
 */
function factoryAsync(
  record: ProviderRecord,
  asyncFlags: ReadonlyMap<string, boolean>,
): boolean | null {
  return (
    asyncFlags.get(record.id) ??
    (record.lifetime === 'transient' ? false : null)
  );
}

/**
 * The context setup hooks receive. `blueprint()` reads the published
 * blueprint on each call, so it follows every load(), and returns the one
 * cached view of it. `builtAsync` reads the async flags the root and its
 * scopes record per factory build.
 */
export function pluginContext(
  state: RootState,
  container: Nexus,
): PluginContext {
  return Object.freeze({
    container,
    blueprint: () => viewOfBlueprint(state.blueprint),
    builtAsync: (providerId: string) => {
      const record = state.blueprint.providers.get(providerId);
      return record?.kind === 'factory'
        ? factoryAsync(record, state.asyncFlags)
        : null;
    },
  });
}
