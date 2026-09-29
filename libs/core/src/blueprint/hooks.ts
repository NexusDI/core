import {
  moduleInternals,
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { readProvider } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken } from '../definitions/token.js';
import { PluginError, type NexusError } from '../errors/index.js';
import {
  NO_ENTRIES,
  type DepEntry,
  type ProviderRecord,
  type RecordShape,
  type TokenKey,
} from './blueprint.js';
import { normalizeProvider } from './records.js';
import {
  providerView,
  sameToken,
  type BlueprintView,
  type Canonicalizer,
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

/** The context every compile hook of one compile receives; `canon` is the container's canonicalizer. */
export function compileContext(
  phase: CompileContext['phase'],
  canon: Canonicalizer,
): CompileContext {
  return Object.freeze({
    phase,
    canonical: canon,
    configuredFrom: (module: ModuleDefinition) => {
      const base = moduleInternals(module)?.base;
      return base === undefined || base === module ? undefined : base;
    },
  });
}

/** NEXUS_PLUGIN_FAILED for a hook call that threw `cause` or returned a bad value. */
export function pluginFailed(
  plugin: string,
  hook: string,
  cause: unknown,
  disposalErrors: readonly unknown[] = [],
): PluginError {
  return new PluginError(
    {
      code: 'NEXUS_PLUGIN_FAILED',
      plugin,
      reason: null,
      detail: [],
      apiVersion: null,
      supported: [],
      plugins: [],
      target: null,
      hook,
      disposalErrors,
    },
    { cause },
  );
}

/**
 * Maps a token to the token that stands for its key: the first token met
 * with that key. The first plugin whose tokenKey returns a value other than
 * undefined decides the key; a token no plugin keys is its own key, and
 * REQUEST always is. Each token asks the hooks once. A hook's throw is
 * NEXUS_PLUGIN_FAILED, and the token asks again next time. With no hook it
 * returns sameToken, so a lookup allocates nothing (spec D19).
 */
export function canonicalizer(
  hooks: readonly Hook<(token: TokenKey) => unknown>[],
): Canonicalizer {
  if (hooks.length === 0) return sameToken;
  const byToken = new WeakMap<TokenKey, TokenKey>([[REQUEST, REQUEST]]);
  const byKey = new Map<unknown, TokenKey>();
  return (token) => {
    let canonical = byToken.get(token);
    if (canonical !== undefined) return canonical;
    let key: unknown;
    for (const hook of hooks) {
      try {
        key = hook.call(token);
      } catch (error) {
        throw pluginFailed(hook.plugin, 'tokenKey', error);
      }
      if (key !== undefined) break;
    }
    canonical = key === undefined ? token : (byKey.get(key) ?? token);
    if (key !== undefined) byKey.set(key, canonical);
    byToken.set(token, canonical);
    return canonical;
  };
}

/**
 * `canon` for one compile. A hook's throw joins `errors` once per token, and
 * the token keys to itself, so the compile reports it with the rest.
 * Only the walk and rewriteProviders use it; views and contexts get the
 * container's canonicalizer, because a plugin can keep them after the
 * compile.
 */
export function reportingCanon(
  canon: Canonicalizer,
  errors: NexusError[],
): Canonicalizer {
  const failed = new Set<TokenKey>();
  return (token) => {
    try {
      return canon(token);
    } catch (error) {
      if (!failed.has(token)) errors.push(error as NexusError);
      failed.add(token);
      return token;
    }
  };
}

/**
 * `shape` with its token, deps, properties and alias target keyed through
 * `canon`. Each dep keeps the token it named as `written`, and an alias its
 * target as `writtenTarget`, for the edges.
 */
export function keyShape(
  shape: RecordShape,
  canon: Canonicalizer,
): RecordShape {
  const key = (dep: DepEntry): DepEntry => ({
    ...dep,
    token: canon(dep.token),
    written: dep.token,
  });
  const { target } = shape;
  return {
    ...shape,
    token: canon(shape.token),
    deps: shape.deps.map(key),
    props: shape.props.map((prop) => ({ ...prop, dep: key(prop.dep) })),
    target: target && canon(target),
    writtenTarget: target,
  };
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
      errors.push(pluginFailed(hook.plugin, site.hook, error));
      continue;
    }
    if (result === undefined) continue;
    const value = site.accept(result);
    if (value === undefined) {
      errors.push(
        pluginFailed(
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
          plugin: null,
          reason: null,
          detail: [],
          apiVersion: null,
          supported: [],
          plugins: [chosen.plugin, hook.plugin],
          target: site.target,
          hook: null,
          disposalErrors: [],
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

/**
 * A `with` form without an own `remove`, whose own `label`, when present, is
 * a non-empty string; or an own `remove: true` form. Every key is read as an
 * own key only, so a polluted Object.prototype adds none (SEC-003).
 */
function isRewrite(value: unknown): value is ProviderRewrite {
  if (typeof value !== 'object' || value === null) return false;
  if (!Object.hasOwn(value, 'with'))
    return (
      Object.hasOwn(value, 'remove') &&
      (value as { remove?: unknown }).remove === true
    );
  if (Object.hasOwn(value, 'remove')) return false;
  if (!Object.hasOwn(value, 'label')) return true;
  const label = (value as { label?: unknown }).label;
  return typeof label === 'string' && label !== '';
}

/** The `with` form, told apart by an own `with` key as isRewrite checked it. */
function isReplacement(
  rewrite: ProviderRewrite,
): rewrite is Extract<ProviderRewrite, { readonly with: unknown }> {
  return Object.hasOwn(rewrite, 'with');
}

/** Whether a replacement entry sets its own lifetime (an own key only, SEC-003). */
function setsOption(entry: unknown, key: 'lifetime' | 'eager'): boolean {
  const options = readProvider(entry)?.options ?? entry;
  return (
    typeof options === 'object' &&
    options !== null &&
    Object.hasOwn(options, key)
  );
}

/**
 * Pass 1, after the walk: every compile.provider hook sees every record.
 * `with` replaces in place (id, module and, unless the entry sets them,
 * lifetime and eager kept); `pin` also drops every other provider of the token and
 * makes the replacement visible in every module; `remove` drops the record.
 * With no compile.provider hook it returns `records` itself and the shared
 * empty maps. `canon`, when a tokenKey hook is registered, keys a
 * replacement's tokens as the walk keyed the module's.
 */
export function rewriteProviders(
  records: readonly ProviderRecord[],
  hooks: CompileHooks,
  context: CompileContext,
  errors: NexusError[],
  canon?: Canonicalizer,
): {
  readonly records: readonly ProviderRecord[];
  readonly pinned: ReadonlyMap<TokenKey, readonly string[]>;
  readonly rewrittenBy: ReadonlyMap<string, string>;
} {
  if (hooks.provider.length === 0)
    return { records, pinned: NO_ENTRIES, rewrittenBy: NO_ENTRIES };
  const pinned = new Map<TokenKey, readonly string[]>();
  const rewrittenBy = new Map<string, string>();
  // Site → entry → its shape, or null when it failed. One entry a hook
  // returns for several providers at one site is normalised, and reported,
  // once.
  const shapes = new Map<string, Map<unknown, RecordShape | null>>();

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
    if (!isReplacement(rewrite)) continue;
    const label = Object.hasOwn(rewrite, 'label')
      ? rewrite.label
      : chosen.plugin;
    const site = `${label}(${record.name})`;
    let atSite = shapes.get(site);
    if (atSite === undefined) {
      atSite = new Map();
      shapes.set(site, atSite);
    }
    let shape = atSite.get(rewrite.with);
    if (shape === undefined) {
      shape = normalizeProvider(
        rewrite.with,
        { module: site, index: 0 },
        errors,
      );
      if (shape !== null && canon !== undefined) shape = keyShape(shape, canon);
      atSite.set(rewrite.with, shape);
    }
    if (shape === null) {
      out.push(record);
      continue;
    }
    const keepLifetime = !setsOption(rewrite.with, 'lifetime');
    const lifetime =
      shape.lifetime === null
        ? null
        : keepLifetime
          ? (record.lifetime ?? shape.lifetime)
          : shape.lifetime;
    out.push({
      ...shape,
      token: record.token,
      id: record.id,
      index: record.index,
      module: record.module,
      name: record.name,
      lifetime,
      // eager is kept as lifetime is, unless the entry sets one. A value,
      // an alias or a transient builds nothing to defer, so it stays eager.
      eager:
        lifetime === null || lifetime === 'transient'
          ? true
          : setsOption(rewrite.with, 'eager')
            ? shape.eager
            : record.eager,
    });
    rewrittenBy.set(record.id, chosen.plugin);
    if (
      Object.hasOwn(rewrite, 'pin') &&
      rewrite.pin === true &&
      record.token instanceof MultiToken
    )
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
      errors.push(pluginFailed(hook.plugin, 'compile.check', error));
    }
  }
}
