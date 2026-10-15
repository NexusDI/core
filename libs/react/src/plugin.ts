import {
  displayName,
  moduleDefinitionOf,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type LookupOptions,
  type Nexus,
  type NexusPlugin,
  type ProviderView,
} from '@nexusdi/core';

import { transientInRender } from './errors.js';

/** One blueprint reader per container that registered react(). */
const readers = new WeakMap<Nexus, () => BlueprintView>();

interface ViewIndex {
  readonly byId: ReadonlyMap<string, ProviderView>;
  readonly aliasTarget: ReadonlyMap<string, string>;
  /** module id, then token, then the transient provider or null. */
  readonly results: Map<string, Map<unknown, ProviderView | null>>;
}

/** One index per published view: a load() publishes a new view object (core K2). */
const indexes = new WeakMap<BlueprintView, ViewIndex>();

function indexOf(view: BlueprintView): ViewIndex {
  let index = indexes.get(view);
  if (index === undefined) {
    index = {
      byId: new Map(view.providers.map((p) => [p.id, p])),
      aliasTarget: new Map(
        view.edges.filter((e) => e.kind === 'alias').map((e) => [e.from, e.to]),
      ),
      results: new Map(),
    };
    indexes.set(view, index);
  }
  return index;
}

/** The provider an alias chain ends at, or undefined for a broken chain. */
function target(index: ViewIndex, id: string): ProviderView | undefined {
  const seen = new Set<string>();
  let provider = index.byId.get(id);
  while (provider?.kind === 'alias') {
    if (seen.has(provider.id)) return undefined;
    seen.add(provider.id);
    const next = index.aliasTarget.get(provider.id);
    provider = next === undefined ? undefined : index.byId.get(next);
  }
  return provider;
}

/** The module core's get() selects for { module: ref }: the definition, or the module that replaced it (core K6). */
function moduleIdOf(view: BlueprintView, ref: unknown): string | undefined {
  const definition = moduleDefinitionOf(ref as never);
  if (definition === undefined) return undefined;
  return view.modules.find(
    (m) => m.definition === definition || m.replaced === definition,
  )?.id;
}

/**
 * Throws NEXUS_REACT_TRANSIENT_IN_RENDER when `token` binds a transient
 * provider, or a MultiToken has a transient contribution, before get() runs.
 * Does nothing for a container without react(), or when the view has no
 * provider: get() then throws its own error.
 */
export function checkTransient(
  container: Nexus,
  token: unknown,
  options?: LookupOptions,
): void {
  const read = readers.get(container);
  if (read === undefined) return;
  const view = read();
  const moduleId =
    options?.module === undefined
      ? view.root
      : moduleIdOf(view, options.module);
  if (moduleId === undefined) return;
  const index = indexOf(view);
  let byToken = index.results.get(moduleId);
  if (byToken === undefined) {
    byToken = new Map();
    index.results.set(moduleId, byToken);
  }
  let found = byToken.get(token);
  if (found === undefined) {
    found = null;
    for (const id of view.visible(moduleId, token as never)) {
      const provider = target(index, id);
      if (provider?.lifetime === 'transient') {
        found = provider;
        break;
      }
    }
    byToken.set(token, found);
  }
  // The class a class provider builds names it best; a factory or value
  // provider has none, and its view name stands in.
  if (found !== null)
    throw transientInRender(
      displayName(token),
      found.implementation?.name ?? found.name,
    );
}

/**
 * The transient check for useService (react spec 4.2 and 5). Register it in
 * development and tests, beside devtools(); the package reads no
 * environment variable.
 */
export function react(): NexusPlugin {
  return {
    name: 'nexusdi-react',
    apiVersion: NEXUS_PLUGIN_API,
    setup(context) {
      readers.set(context.container, () => context.blueprint());
    },
  };
}
