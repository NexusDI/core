import {
  moduleDefinitionOf,
  MultiToken,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type CompileContext,
  type ModuleDefinition,
  type NexusError,
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
  readonly onInit: boolean;
}

const nameOf = (token: unknown): string =>
  typeof token === 'function'
    ? token.name
    : String((token as { description?: unknown }).description);

/**
 * The tokens and module definitions a module of the view exports, and
 * through each module it re-exports, what that module exports. A module a
 * compile.module hook replaced counts under its original definition too.
 */
function exportsOf(view: BlueprintView, stub: ModuleDefinition): Set<unknown> {
  const exported = new Set<unknown>();
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const module = view.modules.find((m) => m.id === id);
    for (const entry of module?.exports ?? []) {
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
}

const noMatches = (context: CompileContext | undefined): Matches => ({
  context,
  tokens: new Set(),
  modules: new Map(),
  pinned: new Set(),
});

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
      provider(provider, context) {
        const entry = state.providers.get(provider.token);
        if (entry === undefined) return undefined;
        const current = matchesOf(context);
        current.tokens.add(provider.token);
        if (!(provider.token instanceof MultiToken)) return { with: entry };
        if (current.pinned.has(provider.token)) return undefined;
        current.pinned.add(provider.token);
        return { with: entry, pin: true };
      },
      check(view, report: (error: NexusError) => void) {
        if (view.phase === 'create') {
          for (const token of state.providers.keys())
            if (!matches.tokens.has(token))
              report(overrideUnused(nameOf(token)));
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
            return exported.has(entry) ? [] : [nameOf(entry)];
          });
          if (missing.length > 0)
            report(overrideExports(original.name, missing));
        }
      },
    },
  };
}
