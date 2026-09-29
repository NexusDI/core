import type { BlueprintView } from '@nexusdi/core';

/** The compiled graph as plain JSON. The docs playground renders it; the graph CLI reads it. */
export interface NexusGraph {
  modules: Array<{
    id: string;
    name: string;
    global: boolean;
    /** Module ids. */
    imports: string[];
    /** Provider ids and module ids. */
    exports: string[];
  }>;
  providers: Array<{
    id: string;
    /** The display name: a class's name or a token's description. */
    token: string;
    /** The owning module's id. */
    module: string;
    /** null for value and alias providers. */
    lifetime: 'singleton' | 'scoped' | 'transient' | null;
    kind: 'class' | 'value' | 'factory' | 'alias';
    eager: boolean;
    /**
     * Factories: whether a build returned a thenable. A singleton or scoped
     * factory reports null before its first build, and a transient factory
     * false until a get() throws NEXUS_ASYNC_TRANSIENT for it. Class and
     * value providers: false. Aliases: null. Every provider in inspect()'s
     * graph: null.
     */
    async: boolean | null;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
  }>;
}

/**
 * The graph of `view`. `asyncOf` answers a factory's `async`; null reports
 * every provider's `async` as null, for a graph nothing was built from.
 */
export function graphOf(
  view: BlueprintView,
  asyncOf: ((providerId: string) => boolean | null) | null,
): NexusGraph {
  return {
    modules: view.modules.map((m) => ({
      id: m.id,
      name: m.name,
      global: m.global,
      imports: [...m.imports],
      exports: [...m.exports],
    })),
    providers: view.providers.map((p) => ({
      id: p.id,
      token: p.name,
      module: p.module,
      lifetime: p.lifetime,
      kind: p.kind,
      eager: p.eager,
      async:
        asyncOf === null
          ? null
          : p.kind === 'factory'
            ? asyncOf(p.id)
            : p.kind === 'alias'
              ? null
              : false,
    })),
    edges: view.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  };
}
