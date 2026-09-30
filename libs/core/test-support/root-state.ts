import type { Nexus } from '../src/runtime/nexus.js';
import {
  createRootState,
  type RootInit,
  type RootState,
} from '../src/runtime/state.js';

/**
 * A root state for tests that drive the runtime without Nexus.create. These
 * roots register no plugins, so no construct hook reads the handle, and an
 * empty object stands in for it.
 */
export function rootState(init: Omit<RootInit, 'wrap'>): RootState {
  return createRootState({ ...init, wrap: () => ({}) as Nexus });
}
