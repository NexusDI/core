import {
  moduleInternals,
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { readProvider } from '../definitions/provide.js';
import { MultiToken } from '../definitions/token.js';
import { PluginError, type NexusError } from '../errors/index.js';
import { NO_ENTRIES, type ProviderRecord, type TokenKey } from './blueprint.js';
import { normalizeProvider } from './records.js';
import {
  providerView,
  type BlueprintView,
  type CompileContext,
  type ProviderRewrite,
  type ProviderView,
} from './views.js';

/** A plugin's hook, bound to the plugin, with the plugin's name for errors. */
export interface Hook<F> {
  readonly plugin: string;
  readonly call: F;
}

export type ModuleHook = (
  module: ModuleDefinition,
  context: CompileContext,
) => unknown;
export type ProviderHook = (
  provider: ProviderView,
  context: CompileContext,
) => unknown;
export type CheckHook = (
  view: BlueprintView,
  report: (error: NexusError) => void,
) => void;

export interface CompileHooks {
  readonly module: readonly Hook<ModuleHook>[];
  readonly provider: readonly Hook<ProviderHook>[];
  readonly check: readonly Hook<CheckHook>[];
}

export const NO_COMPILE_HOOKS: CompileHooks = Object.freeze({
  module: Object.freeze([]),
  provider: Object.freeze([]),
  check: Object.freeze([]),
});

export function compileContext(phase: CompileContext['phase']): CompileContext {
  return Object.freeze({
    phase,
    configuredFrom: (module: ModuleDefinition) => {
      const base = moduleInternals(module)?.base;
      return base === undefined || base === module ? undefined : base;
    },
  });
}

function failed(plugin: string, hook: string, cause: unknown): PluginError {
  return new PluginError({ code: 'NEXUS_PLUGIN_FAILED', plugin, hook, cause });
}

/** Where a compile hook runs, for its errors. */
interface HookSite<R> {
  readonly hook: 'compile.module' | 'compile.provider';
  /** The display name of what the hook may replace. */
  readonly target: string;
  /** What the hook returns, for the TypeError of a bad result. */
  readonly returns: string;
  /** The result as R, or undefined when it is not one. */
  accept(result: unknown): R | undefined;
}

/**
 * Calls every hook with `subject` in plugin order and returns the first
 * accepted result with its plugin. A throw or a result `accept` refuses
 * becomes NEXUS_PLUGIN_FAILED, and a second accepted result
 * NEXUS_PLUGIN_CONFLICT.
 */
function firstAnswer<S, R>(
  hooks: readonly Hook<(subject: S, context: CompileContext) => unknown>[],
  subject: S,
  context: CompileContext,
  site: HookSite<R>,
  errors: NexusError[],
): { readonly plugin: string; readonly value: R } | undefined {
  let chosen: { plugin: string; value: R } | undefined;
  for (const hook of hooks) {
    let result: unknown;
    try {
      result = hook.call(subject, context);
    } catch (error) {
      errors.push(failed(hook.plugin, site.hook, error));
      continue;
    }
    if (result === undefined) continue;
    const value = site.accept(result);
    if (value === undefined) {
      errors.push(
        failed(
          hook.plugin,
          site.hook,
          new TypeError(
            `returned ${describeValue(result)}; a ${site.hook} hook returns ${site.returns}.`,
          ),
        ),
      );
      continue;
    }
    if (chosen !== undefined) {
      errors.push(
        new PluginError({
          code: 'NEXUS_PLUGIN_CONFLICT',
          plugins: [chosen.plugin, hook.plugin],
          target: site.target,
        }),
      );
      continue;
    }
    chosen = { plugin: hook.plugin, value };
  }
  return chosen;
}

/**
 * The module the walk visits in place of `definition`: the one the first
 * plugin returns, or `definition`. Each definition is asked once per compile.
 * `replaced` records replacement → original for the views.
 */
export function moduleReplacerFor(
  hooks: CompileHooks,
  context: CompileContext,
  errors: NexusError[],
  replaced: Map<ModuleDefinition, ModuleDefinition>,
): (definition: ModuleDefinition) => ModuleDefinition {
  const decided = new Map<ModuleDefinition, ModuleDefinition>();
  return (definition) => {
    const known = decided.get(definition);
    if (known !== undefined) return known;
    const chosen = firstAnswer(
      hooks.module,
      definition,
      context,
      {
        hook: 'compile.module',
        target: definition.name,
        returns: 'a module or undefined',
        accept: resolveModuleRef,
      },
      errors,
    );
    const result = chosen?.value ?? definition;
    if (chosen !== undefined) replaced.set(result, definition);
    decided.set(definition, result);
    return result;
  };
}

function isRewrite(value: unknown): value is ProviderRewrite {
  if (typeof value !== 'object' || value === null) return false;
  return Object.hasOwn(value, 'with')
    ? !Object.hasOwn(value, 'remove')
    : (value as { remove?: unknown }).remove === true;
}

/** Whether a replacement entry sets its own lifetime (an own key only, SEC-003). */
function setsLifetime(entry: unknown): boolean {
  const options = readProvider(entry)?.options ?? entry;
  return (
    typeof options === 'object' &&
    options !== null &&
    Object.hasOwn(options, 'lifetime')
  );
}

/**
 * Pass 1, after the walk: every compile.provider hook sees every record.
 * `with` replaces in place (id, module and, unless the entry sets one,
 * lifetime kept); `pin` also drops every other provider of the token and
 * makes the replacement visible in every module; `remove` drops the record.
 * With no compile.provider hook it returns `records` itself and the shared
 * empty maps.
 */
export function rewriteProviders(
  records: readonly ProviderRecord[],
  hooks: CompileHooks,
  context: CompileContext,
  errors: NexusError[],
): {
  readonly records: readonly ProviderRecord[];
  readonly pinned: ReadonlyMap<TokenKey, readonly string[]>;
  readonly rewrittenBy: ReadonlyMap<string, string>;
} {
  if (hooks.provider.length === 0)
    return { records, pinned: NO_ENTRIES, rewrittenBy: NO_ENTRIES };
  const pinned = new Map<TokenKey, readonly string[]>();
  const rewrittenBy = new Map<string, string>();

  const out: ProviderRecord[] = [];
  for (const record of records) {
    const chosen = firstAnswer(
      hooks.provider,
      providerView(record, null),
      context,
      {
        hook: 'compile.provider',
        target: record.name,
        returns: '{ with }, { remove: true } or undefined',
        accept: (result) => (isRewrite(result) ? result : undefined),
      },
      errors,
    );
    if (chosen === undefined) {
      out.push(record);
      continue;
    }
    const rewrite = chosen.value;
    if ('remove' in rewrite) continue;
    const shape = normalizeProvider(
      rewrite.with,
      { module: `${chosen.plugin}(${record.name})`, index: 0 },
      errors,
    );
    if (shape === null) {
      out.push(record);
      continue;
    }
    const keepLifetime = !setsLifetime(rewrite.with);
    out.push({
      ...shape,
      token: record.token,
      id: record.id,
      index: record.index,
      module: record.module,
      name: record.name,
      lifetime:
        shape.lifetime === null
          ? null
          : keepLifetime
            ? (record.lifetime ?? shape.lifetime)
            : shape.lifetime,
    });
    rewrittenBy.set(record.id, chosen.plugin);
    if (rewrite.pin === true && record.token instanceof MultiToken)
      pinned.set(record.token, [record.id]);
  }
  const kept = out.filter((r) => {
    const pin = pinned.get(r.token);
    return pin === undefined || pin.includes(r.id);
  });
  return { records: kept, pinned, rewrittenBy };
}

/** Runs every compile.check hook in order; a throw becomes NEXUS_PLUGIN_FAILED. */
export function runChecks(
  hooks: CompileHooks,
  view: BlueprintView,
  errors: NexusError[],
): void {
  for (const hook of hooks.check) {
    try {
      hook.call(view, (error) => {
        errors.push(error);
      });
    } catch (error) {
      errors.push(failed(hook.plugin, 'compile.check', error));
    }
  }
}
