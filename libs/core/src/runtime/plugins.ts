import type { CompileHooks, Hook } from '../blueprint/hooks.js';
import type {
  BlueprintView,
  CompileContext,
  ProviderRewrite,
  ProviderView,
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
import type { Nexus } from './nexus.js';
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
  setup?(context: PluginContext): void;
  dispose?(): void | PromiseLike<void>;
}

type Fn = (...args: never[]) => unknown;

/** A container's plugins, split into per-hook arrays in plugin order. */
export interface PluginSet {
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
  readonly setup: readonly Hook<(context: PluginContext) => void>[];
  readonly dispose: readonly Hook<() => unknown>[];
}

const FUNCTION_HOOKS = [
  'construct',
  'observe',
  'formatError',
  'setup',
  'dispose',
] as const;
const COMPILE_HOOKS = ['module', 'provider', 'check'] as const;

export const NO_PLUGINS: PluginSet = Object.freeze({
  modules: Object.freeze([]),
  onInit: true,
  compile: Object.freeze({ module: [], provider: [], check: [] }),
  construct: Object.freeze([]),
  observe: Object.freeze([]),
  formatError: Object.freeze([]),
  setup: Object.freeze([]),
  dispose: Object.freeze([]),
});

function own(object: object, key: string): unknown {
  return Object.hasOwn(object, key)
    ? (object as Record<string, unknown>)[key]
    : undefined;
}

function bind<F extends Fn>(owner: object, plugin: string, fn: F): Hook<F> {
  return {
    plugin,
    call: ((...args: never[]) => fn.apply(owner, args)) as F,
  };
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
      new PluginError({ code: 'NEXUS_PLUGIN_INVALID', plugin, reason, detail }),
    );
  };
  if (!Array.isArray(input)) {
    invalid('plugins', 'not-an-array', [describeValue(input)]);
    throw new BlueprintError(errors);
  }

  const modules: unknown[] = [];
  const hooks = {
    module: [] as Hook<never>[],
    provider: [] as Hook<never>[],
    check: [] as Hook<never>[],
    construct: [] as Hook<never>[],
    observe: [] as Hook<never>[],
    formatError: [] as Hook<never>[],
    setup: [] as Hook<never>[],
    dispose: [] as Hook<never>[],
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
    const name = own(candidate, 'name');
    if (typeof name !== 'string' || name === '') {
      invalid(at, 'no-name');
      continue;
    }
    if (names.has(name)) {
      invalid(name, 'duplicate-name');
      continue;
    }
    names.add(name);

    const apiVersion = own(candidate, 'apiVersion');
    if (
      typeof apiVersion !== 'number' ||
      !SUPPORTED_PLUGIN_APIS.includes(apiVersion)
    ) {
      errors.push(
        new PluginError({
          code: 'NEXUS_PLUGIN_VERSION',
          plugin: name,
          apiVersion: String(apiVersion),
          supported: SUPPORTED_PLUGIN_APIS,
        }),
      );
      continue;
    }

    const before = errors.length;

    // Read each own hook key exactly once, into a local record, so a getter
    // is never read twice: once here to validate, once again to register.
    const hookFns: Partial<Record<(typeof FUNCTION_HOOKS)[number], unknown>> =
      {};
    for (const key of FUNCTION_HOOKS) {
      const fn = own(candidate, key);
      hookFns[key] = fn;
      if (fn !== undefined && typeof fn !== 'function')
        invalid(name, 'bad-hook', [key]);
    }

    const initFlag = own(candidate, 'onInit');
    if (initFlag !== undefined && initFlag !== false)
      invalid(name, 'bad-on-init', [describeValue(initFlag)]);

    const compile = own(candidate, 'compile');
    const compileFns: Partial<Record<(typeof COMPILE_HOOKS)[number], unknown>> =
      {};
    if (compile !== undefined) {
      if (typeof compile !== 'object' || compile === null) {
        invalid(name, 'bad-compile');
      } else {
        let compileOk = true;
        for (const key of COMPILE_HOOKS) {
          const fn = own(compile, key);
          compileFns[key] = fn;
          if (fn !== undefined && typeof fn !== 'function') compileOk = false;
        }
        if (!compileOk) invalid(name, 'bad-compile');
      }
    }

    const pluginModules = own(candidate, 'modules');
    if (pluginModules !== undefined && !Array.isArray(pluginModules))
      invalid(name, 'bad-modules');

    if (errors.length > before) continue;

    for (const key of FUNCTION_HOOKS) {
      const fn = hookFns[key];
      if (typeof fn === 'function')
        hooks[key].push(bind(candidate, name, fn as Fn) as Hook<never>);
    }
    if (typeof compile === 'object' && compile !== null) {
      for (const key of COMPILE_HOOKS) {
        const fn = compileFns[key];
        if (typeof fn === 'function')
          hooks[key].push(bind(compile, name, fn as Fn) as Hook<never>);
      }
    }
    if (initFlag === false) onInit = false;
    if (Array.isArray(pluginModules)) modules.push(...pluginModules);
  }
  if (errors.length > 0) throw new BlueprintError(errors);

  return Object.freeze({
    modules: Object.freeze(modules),
    onInit,
    compile: Object.freeze({
      module: Object.freeze(hooks.module),
      provider: Object.freeze(hooks.provider),
      check: Object.freeze(hooks.check),
    }),
    construct: Object.freeze(hooks.construct),
    observe: Object.freeze(hooks.observe),
    formatError: Object.freeze(hooks.formatError),
    setup: Object.freeze(hooks.setup),
    dispose: Object.freeze(hooks.dispose),
  }) as PluginSet;
}
