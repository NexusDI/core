import { REQUEST_ID, type ProviderRecord } from './blueprint.js';

export interface Levels {
  readonly singleton: string[][];
  readonly scoped: string[][];
}

type Member = (record: ProviderRecord) => boolean;

/**
 * Pass 6. A member with no member deps is level 0; every other member is one
 * more than its highest member dep. Transients and aliases pass through: they
 * contribute the levels reached past them, with no `+1` for the pass-through
 * hop itself. Lazy edges are not in `strong`, so they never contribute.
 *
 * `contribute(id)` is a pure function of `id` (`providers` and `strong` are
 * fixed for one call), member or not, so one memo covers both what the
 * original two-function split called a member's own level and a pass-through
 * node's reach: for a member it is `1 + max(contribute(successor))`, for a
 * pass-through it is `max(contribute(successor))` with no `+1`, and for
 * anything else it is `-1`. Walked with an explicit stack, not recursion: a
 * pass-through chain, or a chain of singleton or scoped deps, can be
 * arbitrarily long, and recursing one call frame per hop would let it
 * overflow the call stack.
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

      // Frame is done: memoise it and fold its value into the frame below,
      // the same way tarjan.ts folds a finished frame's low-link into its
      // parent's after popping, rather than only when a child was already
      // memoised before this frame tried to visit it.
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
 * Every scoped provider `createScope` must build: every scoped factory, and
 * every scoped provider reached through a chain of transients and aliases
 * from one. Walked with an explicit stack, not recursion, for the same
 * reason `levelFunction` is: a pass-through chain can be arbitrarily long.
 *
 * `seen` guards every id ever pushed, scoped or pass-through alike, so a
 * shared node under a fan-out of transients or aliases (a "diamond": two or
 * more nodes depending on the same downstream node) is expanded once. Without
 * it, each of a diamond's incoming edges re-explores the whole subgraph below
 * the shared node, and stacking N diamonds costs O(2^N): unlike a plain long
 * chain, this is not a call-stack depth problem an explicit stack alone
 * fixes, it is a suppressed-revisit problem.
 */
function collectScoped(
  providers: ReadonlyMap<string, ProviderRecord>,
  strong: ReadonlyMap<string, readonly string[]>,
  isScoped: Member,
): Set<string> {
  const needed = new Set<string>();
  const seen = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    stack.push(id);
  };

  for (const record of providers.values()) {
    if (isScoped(record) && record.kind === 'factory') {
      needed.add(record.id);
      visit(record.id);
    }
  }

  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const next of strong.get(id) ?? []) {
      const record = providers.get(next);
      if (record === undefined) continue;
      if (isScoped(record)) {
        needed.add(next);
        visit(next);
      } else if (record.lifetime === 'transient' || record.kind === 'alias') {
        visit(next);
      }
    }
  }

  return needed;
}

export function computeLevels(
  providers: ReadonlyMap<string, ProviderRecord>,
  strong: ReadonlyMap<string, readonly string[]>,
): Levels {
  const rank = (id: string): number => providers.get(id)?.index ?? 0;
  const isSingleton: Member = (r) => r.lifetime === 'singleton';
  const isScoped: Member = (r) =>
    r.lifetime === 'scoped' && r.id !== REQUEST_ID;

  const singletons = [...providers.values()]
    .filter(isSingleton)
    .map((r) => r.id);

  // createScope builds every scoped factory and the scoped providers it depends on.
  const needed = collectScoped(providers, strong, isScoped);

  return {
    singleton: group(
      singletons,
      levelFunction(providers, strong, isSingleton),
      rank,
    ),
    scoped: group(
      [...needed],
      levelFunction(providers, strong, isScoped),
      rank,
    ),
  };
}
