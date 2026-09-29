import { settleLevel } from './settle.js';

/**
 * Runs a list of levels in order. Create, load, createScope, extend() and
 * the onInit pass use it. Each level's included ids run `buildOne`
 * together, and the next level starts when every one has settled. A level
 * with no included id is skipped. `afterLevel` gets the level's ids and runs
 * between levels, where the callers mark providers ready and check for
 * disposal. A caller that rolls back records what it touched in `buildOne`,
 * which runs synchronously for every id of a level before any build settles.
 * Returns how many ids it ran.
 */
export async function buildLevels(
  levels: readonly (readonly string[])[],
  include: (id: string) => boolean,
  buildOne: (id: string) => Promise<void>,
  afterLevel: (ids: readonly string[]) => void,
): Promise<number> {
  let built = 0;
  for (const level of levels) {
    const ids = level.filter(include);
    if (ids.length === 0) continue;
    built += ids.length;
    await settleLevel(ids, buildOne);
    afterLevel(ids);
  }
  return built;
}
