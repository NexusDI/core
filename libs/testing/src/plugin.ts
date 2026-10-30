import {
  displayName,
  moduleDefinitionOf,
  MultiToken,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type CompileContext,
  type ModuleDefinition,
  type NexusPlugin,
  type ProviderEntry,
} from '@nexusdi/core';

import { overrideExports, overrideUnused } from './override-error.js';

export interface TestingState {
  /** Token → the provide() result that replaces its providers. */
  readonly providers: ReadonlyMap<unknown, ProviderEntry>;
  /** Module, or configurable base module → the stub walked in its place. */
  readonly modules: ReadonlyMap<ModuleDefinition, ModuleDefinition>;
  /**
   * Module overrides a later load() may be the first to use. create cannot
   * know which modules will load, so these are never reported unused.
   */
  readonly lazyModules: ReadonlySet<ModuleDefinition>;
  /**
   * Token overrides a later load() may be the first to use. create cannot
   * know which tokens a load adds, so these are never reported unused.
   */
  readonly lazyTokens: ReadonlySet<unknown>;
  readonly onInit: boolean;
}

/**
 * The tokens and module definitions a module of the view exports, and
 * through each module it re-exports, what that module exports. A module a
 * compile.module hook replaced counts under its original definition too, and
 * so does every MultiToken any of those modules names in its exports.
 */
function exportsOf(view: BlueprintView, stub: ModuleDefinition): Set<unknown> {
  const exported = new Set<unknown>();
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const module = view.modules.find((m) => m.id === id);
    if (module === undefined) return;
    // A MultiToken a module names in its exports counts as exported. The view
    // lists only the module's own records of it, and a module with none is
    // legal.
    for (const entry of module.definition.exports)
      if (entry instanceof MultiToken) exported.add(view.canonical(entry));
    for (const entry of module.exports) {
      const provider = view.providers.find((p) => p.id === entry);
      if (provider !== undefined) exported.add(provider.token);
      const reexported = view.modules.find((m) => m.id === entry);
      if (reexported === undefined) continue;
      exported.add(reexported.definition);
      if (reexported.replaced !== null) exported.add(reexported.replaced);
      visit(reexported.id);
    }
  };
  const module = view.modules.find((m) => m.definition === stub);
  if (module !== undefined) visit(module.id);
  return exported;
}

/** What one compile matched. */
interface Matches {
  /** The compile these matches belong to, told apart by its context. */
  readonly context: CompileContext | undefined;
  readonly tokens: Set<unknown>;
  /** Original module, or configurable base module → the stub walked. */
  readonly modules: Map<ModuleDefinition, ModuleDefinition>;
  /** MultiTokens whose one replacement this compile already pinned. */
  readonly pinned: Set<unknown>;
  /** MultiToken → the modules whose first contribution a load already replaced. */
  readonly replacedAt: Map<unknown, Set<string>>;
  /** Canonical token → the overrides with its key, from the first compile.provider call. */
  overrides: Map<AnyToken, Override> | undefined;
}

/** A token a compile hook may key, as CompileContext.canonical takes it. */
type AnyToken = Parameters<CompileContext['canonical']>[0];

interface Override {
  /** Every override token with this key, in override order. */
  readonly tokens: readonly unknown[];
  /** The entry of the last of them. */
  readonly entry: ProviderEntry;
}

const noMatches = (context: CompileContext | undefined): Matches => ({
  context,
  tokens: new Set(),
  modules: new Map(),
  pinned: new Set(),
  replacedAt: new Map(),
  overrides: undefined,
});

/**
 * The overrides of `state` by canonical token, built on the first call of a
 * compile. Two override tokens with one key share an entry, and the later
 * override wins. The map is set before it is filled, so a tokenKey throw
 * fails one compile.provider call and the compile keeps what was filled.
 */
function overridesOf(
  state: TestingState,
  current: Matches,
  context: CompileContext,
): Map<AnyToken, Override> {
  if (current.overrides !== undefined) return current.overrides;
  const overrides = new Map<AnyToken, Override>();
  current.overrides = overrides;
  for (const [token, entry] of state.providers) {
    const key = context.canonical(token as AnyToken);
    const tokens = overrides.get(key)?.tokens ?? [];
    overrides.set(key, { tokens: [...tokens, token], entry });
  }
  return overrides;
}

/**
 * The testing container as a plugin: compile.module walks stubs,
 * compile.provider swaps providers, compile.check reports unused overrides
 * and stubs that miss exports. Every hook runs in create and in each load().
 * Core hands each compile a new context, so the matches start over with the
 * first hook call of a compile, even after a compile that threw before its
 * check hooks ran.
 */
export function testingPlugin(state: TestingState): NexusPlugin {
  let matches = noMatches(undefined);
  /** MultiTokens this plugin pinned at an earlier compile. */
  const pinnedBefore = new Set<unknown>();
  const matchesOf = (context: CompileContext): Matches => {
    if (matches.context !== context) matches = noMatches(context);
    return matches;
  };

  return {
    name: 'nexus:testing',
    apiVersion: NEXUS_PLUGIN_API,
    ...(state.onInit ? {} : { onInit: false as const }),
    compile: {
      module(module, context) {
        const current = matchesOf(context);
        for (const key of [module, context.configuredFrom(module)]) {
          if (key === undefined) continue;
          const stub = state.modules.get(key);
          if (stub !== undefined) {
            current.modules.set(key, stub);
            return stub;
          }
        }
        return undefined;
      },
      /**
       * Swaps the provider for the override. A MultiToken override pins at
       * create, and at a load only for a token pinned before, so a load
       * never publishes the contribution it adds. At a load the first
       * contribution of a module is replaced and the module's others are
       * dropped, so the token reads one entry per module, as at create.
       */
      provider(provider, context) {
        const current = matchesOf(context);
        const hit = overridesOf(state, current, context).get(provider.token);
        if (hit === undefined) return undefined;
        for (const token of hit.tokens) current.tokens.add(token);
        const entry = hit.entry;
        if (!(provider.token instanceof MultiToken))
          return { with: entry, label: 'override' };
        if (current.pinned.has(provider.token)) return undefined;
        // A pin made at a load would publish a contribution to every module.
        if (context.phase === 'load' && !pinnedBefore.has(provider.token)) {
          const modules = current.replacedAt.get(provider.token) ?? new Set();
          current.replacedAt.set(provider.token, modules);
          if (modules.has(provider.module)) return { remove: true };
          modules.add(provider.module);
          return { with: entry, label: 'override' };
        }
        current.pinned.add(provider.token);
        pinnedBefore.add(provider.token);
        return { with: entry, pin: true, label: 'override' };
      },
      check(view, report) {
        if (view.phase === 'create') {
          for (const token of state.providers.keys())
            if (!matches.tokens.has(token) && !state.lazyTokens.has(token))
              report(overrideUnused(displayName(token)));
          for (const original of state.modules.keys())
            if (
              !matches.modules.has(original) &&
              !state.lazyModules.has(original)
            )
              report(overrideUnused(original.name));
        }
        for (const [original, stub] of matches.modules) {
          const exported = exportsOf(view, stub);
          const missing = original.exports.flatMap((entry) => {
            const module = moduleDefinitionOf(entry);
            if (module !== undefined)
              return exported.has(module) ? [] : [module.name];
            return exported.has(view.canonical(entry as AnyToken))
              ? []
              : [displayName(entry)];
          });
          if (missing.length > 0)
            report(overrideExports(original.name, missing));
        }
      },
    },
  };
}
