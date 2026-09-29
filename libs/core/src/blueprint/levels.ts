import { REQUEST_ID, type ProviderRecord } from './blueprint.js';

export interface Levels {
  readonly singleton: string[][];
  readonly scoped: string[][];
  /** The eager: false providers left out of both, built at their first request. */
  readonly deferred: Set<string>;
}

type Member = (record: ProviderRecord) => boolean;

/**
 * Pass 6. A member with no member deps is level 0; every other member is one
 * more than its highest member dep. Transients and aliases pass through: they
 * contribute the levels reached past them, with no `+1` for the pass-through
 * hop itself. Lazy edges are not in `strong`, so they never contribute.
 *
 * `contribute(id)` is a pure function of `id` (`providers` and `strong` are
 * fixed for one call), so one memo serves members and pass-through nodes.
 * For a member it is `1 + max(contribute(successor))`, for a pass-through
 * it is `max(contribute(successor))`, and for anything else it is `-1`.
 * The walk uses an explicit stack. A pass-through chain, or a chain of
 * singleton or scoped deps, can be arbitrarily long, and one call frame per
 * hop would overflow the call stack.
 */
function levelFunction(
  providers: ReadonlyMap<string, ProviderRecord>,
  strong: ReadonlyMap<string, readonly string[]>,
  member: Member,
): (id: string) => number {
  const memo = new Map<string, number>();
  const passesThrough = (r: ProviderRecord): boolean =>
    r.lifetime === 'transient' || r.kind === 'alias';

  return function contribute(start: string): number {
    const cached = memo.get(start);
    if (cached !== undefined) return cached;

    const stack: { id: string; next: number; max: number }[] = [];
    const onStack = new Set<string>();
    const push = (id: string): void => {
      stack.push({ id, next: 0, max: -1 });
      onStack.add(id);
    };
    push(start);

    for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
      const record = providers.get(frame.id);
      const isMember = record !== undefined && member(record);
      const passes = record !== undefined && passesThrough(record);

      let value: number | undefined;
      if (!isMember && !passes) {
        value = -1;
      } else {
        const successors = strong.get(frame.id) ?? [];
        if (frame.next < successors.length) {
          const next = successors[frame.next];
          frame.next++;
          if (next === undefined)
            throw new Error(
              `internal: no successor at index ${frame.next - 1} of ${frame.id}`,
            );
          const known = memo.get(next);
          if (known !== undefined) {
            frame.max = Math.max(frame.max, known);
          } else if (!onStack.has(next)) {
            push(next);
          } // strong holds no cycles by the time pass 6 runs; onStack is defensive only.
          continue;
        }
        value = isMember ? frame.max + 1 : frame.max;
      }

      // The frame is done: memoise it and fold its value into the parent
      // frame's max after popping, as tarjan.ts folds a finished frame's
      // low-link into its parent's.
      stack.pop();
      onStack.delete(frame.id);
      memo.set(frame.id, value);
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.max = Math.max(parent.max, value);
    }

    const result = memo.get(start);
    if (result === undefined)
      throw new Error(`internal: no computed level for ${start}`);
    return result;
  };
}

function group(
  ids: readonly string[],
  levelOf: (id: string) => number,
  rank: (id: string) => number,
): string[][] {
  const levels: string[][] = [];
  for (const id of [...ids].sort((a, b) => rank(a) - rank(b))) {
    const level = levelOf(id);
    (levels[level] ??= []).push(id);
  }
  return Array.from(levels, (level) => level ?? []);
}

/**
 * Every member a build must include: each seed, and every member reached
 * from one through strong edges, directly or through a chain of transients
 * and aliases. create seeds with the eager singletons and createScope with
 * the eager scoped factories, so an `eager: false` provider that an eager
 * one needs builds in its level, with its onInit in level order, and one
 * nothing eager needs waits for its first request (spec §6.6). The walk
 * uses an explicit stack for the same reason `levelFunction` does: a chain
 * can be arbitrarily long.
 *
 * `seen` guards every id ever pushed, member or pass-through alike, so a
 * shared node under a fan-out of transients or aliases (a "diamond": two or
 * more nodes depending on the same downstream node) is expanded once. Without
 * it, each of a diamond's incoming edges re-explores the whole subgraph below
 * the shared node, and stacking N diamonds costs O(2^N): unlike a plain long
 * chain, this is not a call-stack depth problem an explicit stack alone
 * fixes, it is a suppressed-revisit problem.
 */
function collectReached(
  providers: ReadonlyMap<string, ProviderRecord>,
  strong: ReadonlyMap<string, readonly string[]>,
  isMember: Member,
  isSeed: Member,
): string[] {
  const needed = new Set<string>();
  const seen = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    stack.push(id);
  };

  for (const record of providers.values()) {
    if (isMember(record) && isSeed(record)) {
      needed.add(record.id);
      visit(record.id);
    }
  }

  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const next of strong.get(id) ?? []) {
      const record = providers.get(next);
      if (record === undefined) continue;
      if (isMember(record)) {
        needed.add(next);
        visit(next);
      } else if (record.lifetime === 'transient' || record.kind === 'alias') {
        visit(next);
      }
    }
  }

  return [...needed];
}

export function computeLevels(
  providers: ReadonlyMap<string, ProviderRecord>,
  strong: ReadonlyMap<string, readonly string[]>,
): Levels {
  const rank = (id: string): number => providers.get(id)?.index ?? 0;
  const isSingleton: Member = (r) => r.lifetime === 'singleton';
  const isScoped: Member = (r) =>
    r.lifetime === 'scoped' && r.id !== REQUEST_ID;

  // create builds the eager singletons and what they need; createScope
  // builds the eager scoped factories and the scoped providers they need.
  const singletons = collectReached(
    providers,
    strong,
    isSingleton,
    (r) => r.eager,
  );
  const scoped = collectReached(
    providers,
    strong,
    isScoped,
    (r) => r.kind === 'factory' && r.eager,
  );

  const levelled = new Set([...singletons, ...scoped]);
  const deferred = new Set<string>();
  for (const record of providers.values())
    if (!record.eager && !levelled.has(record.id)) deferred.add(record.id);

  return {
    deferred,
    singleton: group(
      singletons,
      levelFunction(providers, strong, isSingleton),
      rank,
    ),
    scoped: group(scoped, levelFunction(providers, strong, isScoped), rank),
  };
}
