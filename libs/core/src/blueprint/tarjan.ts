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
 * Tarjan's strongly connected components, iterative so a long dependency
 * chain cannot overflow the call stack. Returns every component that contains
 * a cycle: more than one node, or one node with an edge to itself.
 */
export function findCycles(
  nodes: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const open = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);
  };

  for (const start of nodes) {
    if (index.has(start)) continue;
    open(start);
    const work: { node: string; next: number }[] = [{ node: start, next: 0 }];

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const out = successors.get(frame.node) ?? [];
      if (frame.next < out.length) {
        const target = out[frame.next++]!;
        if (!index.has(target)) {
          open(target);
          work.push({ node: target, next: 0 });
        } else if (onStack.has(target)) {
          low.set(
            frame.node,
            Math.min(low.get(frame.node)!, index.get(target)!),
          );
        }
        continue;
      }

      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined)
        low.set(
          parent.node,
          Math.min(low.get(parent.node)!, low.get(frame.node)!),
        );
      if (low.get(frame.node) !== index.get(frame.node)) continue;

      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== frame.node);
      components.push(component);
    }
  }

  return components.filter(
    (c) => c.length > 1 || (successors.get(c[0]!) ?? []).includes(c[0]!),
  );
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
