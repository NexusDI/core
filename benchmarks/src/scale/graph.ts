/**
 * The one graph model every scale shape produces and every renderer reads
 * (spec 2026-10-01, section 3.1).
 */
import { createHash } from 'node:crypto';

import type { Shape } from './config.ts';

export type ProviderKind = 'class' | 'factory' | 'async-factory' | 'value';

export const PROVIDER_KINDS: readonly ProviderKind[] = [
  'class',
  'factory',
  'async-factory',
  'value',
];

export interface ScaleProvider {
  /** 0..n-1; also the order of the token table in every rendered app. */
  index: number;
  /** p<index>, zero-padded to the width of n-1, e.g. p0042. */
  name: string;
  kind: ProviderKind;
  /** Indexes, in constructor order. A value has none. */
  deps: number[];
  /** Index into modules. Single-module shapes put every provider in module 0. */
  module: number;
}

export interface ScaleModule {
  /** m<index>, zero-padded to the width of the last module index. */
  name: string;
  tier: number;
  imports: number[];
  /** Provider indexes the module exports, ascending. */
  exports: number[];
}

export interface ScaleGraph {
  shape: Shape;
  size: number;
  seed: number;
  providers: ScaleProvider[];
  modules: ScaleModule[];
  /** Modules the root imports: those no other module imports. */
  rootImports: number[];
  /** Providers get() may ask for at the root: the exports of rootImports. */
  entries: number[];
  /** The entry with the largest transitive closure, lowest index on a tie. */
  target: number;
}

/** The figures scale.json records per graph (ScaleGraphRow). */
export interface GraphDescriptor {
  shape: Shape;
  size: number;
  hash: string;
  providers: number;
  edges: number;
  modules: number;
  /** The longest dependency path, in edges. */
  maxDepth: number;
  /** Edges over providers, rounded to 0.01. */
  meanFanOut: number;
  maxFanOut: number;
  maxFanIn: number;
  kinds: Record<ProviderKind, number>;
  target: number;
  /** Providers in the target's closure, the target included. */
  targetClosure: number;
}

/** `prefix` + index, zero-padded to the width of the largest index. */
export function padName(prefix: string, index: number, count: number): string {
  return prefix + String(index).padStart(String(count - 1).length, '0');
}

/**
 * Completes a graph from its providers and modules: the root imports every
 * module no other module imports, its entries are those modules' exports,
 * and the target is the entry whose closure is largest.
 */
export function assemble(
  shape: Shape,
  size: number,
  seed: number,
  providers: ScaleProvider[],
  modules: ScaleModule[],
): ScaleGraph {
  const imported = new Set(modules.flatMap((m) => m.imports));
  const rootImports = modules.map((_, i) => i).filter((i) => !imported.has(i));
  const entries = rootImports
    .flatMap((i) => modules[i].exports)
    .sort((a, b) => a - b);
  let target = -1;
  let best = -1;
  for (const e of entries) {
    const reach = closureSize(providers, e);
    if (reach > best) {
      best = reach;
      target = e;
    }
  }
  return {
    shape,
    size,
    seed,
    providers,
    modules,
    rootImports,
    entries,
    target,
  };
}

/** Providers reachable from `from` through deps, `from` included. */
export function closureSize(
  providers: readonly ScaleProvider[],
  from: number,
): number {
  const seen = new Uint8Array(providers.length);
  const stack = [from];
  let count = 0;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (seen[i]) continue;
    seen[i] = 1;
    count++;
    for (const d of providers[i].deps) if (!seen[d]) stack.push(d);
  }
  return count;
}

/**
 * Throws on the first rule a graph breaks. Every dependency points to a
 * lower index, so the graph is acyclic and renderers can emit in index
 * order. Every dependency is visible from its dependant's module (its own,
 * or an export of a module it imports directly): NexusDI enforces that, so
 * a graph that broke it would fail in NexusDI alone.
 */
export function checkGraph(graph: ScaleGraph): void {
  const { providers, modules } = graph;
  const fail = (message: string): never => {
    throw new Error(`${graph.shape} at ${graph.size}: ${message}`);
  };
  if (providers.length !== graph.size)
    fail(`${providers.length} providers, expected ${graph.size}`);
  const exported = modules.map((m) => new Set(m.exports));
  providers.forEach((p, i) => {
    if (p.index !== i) fail(`index ${i} holds provider ${p.index}`);
    if (p.module < 0 || p.module >= modules.length)
      fail(`${p.name} sits in missing module ${p.module}`);
    if (p.kind === 'value' && p.deps.length > 0)
      fail(`${p.name} is a value with deps`);
    if (new Set(p.deps).size !== p.deps.length)
      fail(`${p.name} lists a dependency twice`);
    const imports = modules[p.module].imports;
    for (const d of p.deps) {
      if (!(d >= 0 && d < i))
        fail(`${p.name} depends on p${d}, whose index is not lower`);
      const dep = providers[d];
      const visible =
        dep.module === p.module ||
        (imports.includes(dep.module) && exported[dep.module].has(d));
      if (!visible)
        fail(`${p.name} in ${modules[p.module].name} cannot see ${dep.name}`);
    }
  });
  modules.forEach((m, k) => {
    for (const i of m.imports)
      if (!(i >= 0 && i < modules.length) || i === k)
        fail(`${m.name} imports module ${i}`);
    for (const e of m.exports)
      if (providers[e]?.module !== k)
        fail(`${m.name} exports p${e}, not its own`);
  });
  if (!graph.entries.includes(graph.target))
    fail(`target ${graph.target} is not an entry`);
}

/** The first 12 hex digits of the SHA-256 of the canonical providers and modules. */
export function hash(graph: ScaleGraph): string {
  const text = canonical({
    providers: graph.providers,
    modules: graph.modules,
  });
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** JSON with object keys sorted at every level, so field order never moves a hash. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}

export function describeGraph(graph: ScaleGraph): GraphDescriptor {
  const { providers } = graph;
  const depth = new Array<number>(providers.length).fill(0);
  const fanIn = new Array<number>(providers.length).fill(0);
  const kinds = Object.fromEntries(PROVIDER_KINDS.map((k) => [k, 0])) as Record<
    ProviderKind,
    number
  >;
  let edges = 0;
  let maxFanOut = 0;
  for (const p of providers) {
    kinds[p.kind]++;
    edges += p.deps.length;
    maxFanOut = Math.max(maxFanOut, p.deps.length);
    for (const d of p.deps) {
      fanIn[d]++;
      depth[p.index] = Math.max(depth[p.index], depth[d] + 1);
    }
  }
  return {
    shape: graph.shape,
    size: graph.size,
    hash: hash(graph),
    providers: providers.length,
    edges,
    modules: graph.modules.length,
    maxDepth: Math.max(0, ...depth),
    meanFanOut: Math.round((edges / providers.length) * 100) / 100,
    maxFanOut,
    maxFanIn: Math.max(0, ...fanIn),
    kinds,
    target: graph.target,
    targetClosure: closureSize(providers, graph.target),
  };
}
