import type { Edge, EdgeKind } from './blueprint.js';

/** Adjacency lists over the edges whose kind `include` accepts. */
export function successorsOf(
  edges: readonly Edge[],
  include: (kind: EdgeKind) => boolean,
): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    if (!include(edge.kind)) continue;
    const list = successors.get(edge.from) ?? [];
    list.push(edge.to);
    successors.set(edge.from, list);
  }
  return successors;
}

/**
 * Tarjan's strongly connected components over nodes `0 .. size - 1`,
 * iterative so a long chain cannot overflow the call stack. The returned
 * function runs the search from a root and skips nodes an earlier call already
 * reached, so callers can start from each node they need in their own order.
 * `settle` receives each component once, after every component it has an edge
 * into.
 */
export function strongComponents(
  size: number,
  successors: (node: number) => readonly number[],
  settle: (component: number[]) => void,
): (root: number) => void {
  let counter = 0;
  const index = new Int32Array(size).fill(-1);
  const low = new Int32Array(size);
  const onStack = new Uint8Array(size);
  const stack: number[] = [];
  const work: { node: number; out: readonly number[]; next: number }[] = [];
  const open = (node: number): void => {
    index[node] = counter;
    low[node] = counter;
    counter++;
    stack.push(node);
    onStack[node] = 1;
    work.push({ node, out: successors(node), next: 0 });
  };

  return (root) => {
    if (index[root] !== -1) return;
    open(root);
    for (let frame = work.at(-1); frame !== undefined; frame = work.at(-1)) {
      const { node } = frame;
      const target = frame.out[frame.next++];
      if (target !== undefined) {
        if (index[target] === -1) open(target);
        else if (onStack[target] === 1)
          low[node] = Math.min(low[node] ?? 0, index[target] ?? 0);
        continue;
      }

      work.pop();
      const parent = work.at(-1);
      if (parent !== undefined)
        low[parent.node] = Math.min(low[parent.node] ?? 0, low[node] ?? 0);
      if (low[node] !== index[node]) continue;

      const component: number[] = [];
      for (
        let member = stack.pop();
        member !== undefined;
        member = stack.pop()
      ) {
        onStack[member] = 0;
        component.push(member);
        if (member === node) break;
      }
      settle(component);
    }
  };
}

/** Whether a component holds a cycle: more than one node, or a self-edge. */
export function isCyclic<N>(
  component: readonly N[],
  successors: (node: N) => readonly N[],
): boolean {
  const [only] = component;
  return (
    component.length > 1 ||
    (only !== undefined && successors(only).includes(only))
  );
}

/** Every strongly connected component that contains a cycle. */
export function findCycles(
  nodes: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const ids = [...new Set([...nodes, ...[...successors.values()].flat()])];
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const out = ids.map((id) =>
    (successors.get(id) ?? []).flatMap((to) => indexOf.get(to) ?? []),
  );
  const next = (node: number): readonly number[] => out[node] ?? [];
  const components: string[][] = [];
  const visit = strongComponents(ids.length, next, (component) => {
    if (isCyclic(component, next))
      components.push(component.flatMap((i) => ids[i] ?? []));
  });
  for (const start of nodes) visit(indexOf.get(start) ?? 0);
  return components;
}

/**
 * One cycle through a component, from its lowest-ranked node back to itself,
 * found by a breadth-first search inside the component.
 */
export function cyclePath(
  component: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>,
  rank: (id: string) => number,
): string[] {
  const members = new Set(component);
  const start = [...component].sort((a, b) => rank(a) - rank(b))[0]!;
  const previous = new Map<string, string>();
  const queue = [start];

  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of successors.get(node) ?? []) {
      if (!members.has(next)) continue;
      if (next === start) {
        const path = [start];
        for (let at = node; at !== start; at = previous.get(at)!)
          path.splice(1, 0, at);
        path.push(start);
        return path;
      }
      if (!previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return [start, start];
}
