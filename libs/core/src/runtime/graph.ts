import type { Blueprint } from '../blueprint/blueprint.js';

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
    /** Factories: whether the last build returned a thenable, null before any build. Aliases: null. */
    async: boolean | null;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
  }>;
}

export function toGraph(
  bp: Blueprint,
  asyncFlags: ReadonlyMap<string, boolean>,
): NexusGraph {
  return {
    modules: [...bp.modules.values()].map((m) => ({
      id: m.id,
      name: m.name,
      global: m.global,
      imports: [...m.imports],
      exports: [...(bp.moduleExports.get(m.id) ?? [])],
    })),
    providers: [...bp.providers.values()].map((p) => ({
      id: p.id,
      token: p.name,
      module: p.module,
      lifetime: p.lifetime,
      kind: p.kind,
      async:
        p.kind === 'factory'
          ? (asyncFlags.get(p.id) ?? null)
          : p.kind === 'alias'
            ? null
            : false,
    })),
    edges: bp.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  };
}
