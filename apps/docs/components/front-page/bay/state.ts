import type { FrontPageState } from '@nexusdi/meridian/scenes/front-page';

import { CONDUIT_IDS, HATCH_IDS, SYSTEM_IDS, type Part } from './geometry';

/**
 * The bay's state object (site UX spec 5.1): for each conduit, system and
 * hatch whether it is intact, plus the chart-server switch. The scene's
 * `rootOf(state)` builds the root module from it, in the run chunk. The
 * controller needs only these pure helpers, so it imports nothing from core.
 * `state.test.ts` asserts that `SEED_STATE` equals the scene's `SEED`.
 */

export type BayState = FrontPageState;

function intact<K extends string>(
  keys: readonly K[],
): Readonly<Record<K, boolean>> {
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, true])),
  ) as Readonly<Record<K, boolean>>;
}

/** The ship as the region `meridian` builds it. */
export const SEED_STATE: BayState = Object.freeze({
  conduits: intact(CONDUIT_IDS),
  systems: intact(SYSTEM_IDS),
  hatches: intact(HATCH_IDS),
  chartServerReachable: true,
});

/** Whether a part is intact: an import in place, a provider declared, an export listed, the server reachable. */
export function isIntact(state: BayState, part: Part): boolean {
  switch (part.kind) {
    case 'conduit':
      return state.conduits[part.key as keyof BayState['conduits']];
    case 'system':
      return state.systems[part.key as keyof BayState['systems']];
    case 'hatch':
      return state.hatches[part.key as keyof BayState['hatches']];
    default:
      return state.chartServerReachable;
  }
}

/** A copy of `state` with one part set intact or broken. */
export function withPart(
  state: BayState,
  part: Part,
  value: boolean,
): BayState {
  switch (part.kind) {
    case 'conduit':
      return Object.freeze({
        ...state,
        conduits: Object.freeze({ ...state.conduits, [part.key]: value }),
      });
    case 'system':
      return Object.freeze({
        ...state,
        systems: Object.freeze({ ...state.systems, [part.key]: value }),
      });
    case 'hatch':
      return Object.freeze({
        ...state,
        hatches: Object.freeze({ ...state.hatches, [part.key]: value }),
      });
    default:
      return Object.freeze({ ...state, chartServerReachable: value });
  }
}

/** Whether the state is the seed. */
export function isSeed(state: BayState): boolean {
  return (
    state.chartServerReachable &&
    [
      ...Object.values(state.conduits),
      ...Object.values(state.systems),
      ...Object.values(state.hatches),
    ].every(Boolean)
  );
}
