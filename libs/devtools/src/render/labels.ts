import type { NexusGraph } from '../graph.js';

/** providers: providers grouped by module. modules: the module import graph. */
export type GraphView = 'providers' | 'modules';

export interface RenderOptions {
  /** Defaults to 'providers'. */
  readonly view?: GraphView;
}

export type GraphModule = NexusGraph['modules'][number];
export type GraphProvider = NexusGraph['providers'][number];
export type GraphEdge = NexusGraph['edges'][number];

/**
 * A provider's label lines: the token, the bound class when its name differs
 * from the token's, then what differs from a class singleton built at create.
 */
export function providerLines(provider: GraphProvider): string[] {
  const lines = [provider.token];
  if (
    provider.implementation !== null &&
    provider.implementation !== provider.token
  )
    lines.push(provider.implementation);
  const traits: string[] = [];
  if (provider.kind !== 'class') traits.push(provider.kind);
  if (provider.lifetime !== null && provider.lifetime !== 'singleton')
    traits.push(provider.lifetime);
  if (!provider.eager) traits.push('on first get');
  if (traits.length > 0) lines.push(traits.join(', '));
  return lines;
}

export function moduleTitle(module: GraphModule): string {
  return module.global ? `${module.name} (global)` : module.name;
}

/**
 * The providers the renderers draw, in graph order: every provider that is
 * not internal, and an internal one when a drawn provider depends on it.
 */
export function drawnProviders(graph: NexusGraph): GraphProvider[] {
  const drawn = new Set(
    graph.providers.filter((p) => !p.internal).map((p) => p.id),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const e of graph.edges)
      if (drawn.has(e.from) && !drawn.has(e.to)) {
        drawn.add(e.to);
        grew = true;
      }
  }
  return graph.providers.filter((p) => drawn.has(p.id));
}

/** The edges between two drawn providers, in graph order. */
export function drawnEdges(
  graph: NexusGraph,
  drawn: readonly GraphProvider[],
): GraphEdge[] {
  const ids = new Set(drawn.map((p) => p.id));
  return graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}

/** `drawn` is drawnProviders(graph), computed once per render. */
export function providerCount(
  drawn: readonly GraphProvider[],
  moduleId: string,
): string {
  const count = membersOf(drawn, moduleId).length;
  return `${count} provider${count === 1 ? '' : 's'}`;
}

/** Ids some module exports: providers and re-exported modules. */
export function exportedIds(graph: NexusGraph): Set<string> {
  return new Set(graph.modules.flatMap((m) => m.exports));
}

/** The drawn providers of one module, in graph order. */
export function membersOf(
  drawn: readonly GraphProvider[],
  moduleId: string,
): GraphProvider[] {
  return drawn.filter((p) => p.module === moduleId);
}
