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

/** The id core gives its built-in REQUEST provider, which every graph lists. */
const REQUEST_ID = 'request';

/**
 * The providers the renderers draw: every one but REQUEST, which appears
 * only when a provider depends on it.
 */
export function drawnProviders(graph: NexusGraph): GraphProvider[] {
  const used = graph.edges.some((e) => e.to === REQUEST_ID);
  return graph.providers.filter((p) => used || p.id !== REQUEST_ID);
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
