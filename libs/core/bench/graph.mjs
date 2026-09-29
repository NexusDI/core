/**
 * A layered DAG in layers of 10 (spec section 14.6 of the benchmarks spec).
 * Position 4 is transient, position 9 scoped, the rest singletons. A class
 * takes positions p % 9 and (p + 1) % 9 of the layer below, so nothing
 * depends on a scoped class.
 */
export function makeGraph(core, size) {
  const providers = [];
  const lookups = [];
  let below = [];
  for (let layer = 0; layer * 10 < size; layer++) {
    const row = [];
    for (let p = 0; p < 10; p++) {
      const deps = layer === 0 ? [] : [below[p % 9], below[(p + 1) % 9]];
      const C = {
        [`C${layer}_${p}`]: class {
          static deps = deps;
        },
      }[`C${layer}_${p}`];
      row.push(C);
      if (p === 9) providers.push(core.provide(C, { lifetime: 'scoped' }));
      else if (p === 4)
        providers.push(core.provide(C, { lifetime: 'transient' }));
      else providers.push(C);
      if (p !== 9) lookups.push(C);
    }
    below = row;
  }
  return { providers, lookups };
}
