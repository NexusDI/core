import { Token } from '@nexusdi/core';

import type { Handles } from './run.ts';

/**
 * The parts of the matrix graph both variants share: the log sink, the
 * tokens, and the classes whose constructor parameters are all self-tokens.
 * The plain and decorated variants register the same graph in their own
 * meridian.ts and import this module for everything else.
 */
export const log: string[] = [];

export interface NavCharts {
  plot(to: string): string;
}
export const NAV_CHARTS = new Token<NavCharts>('NavCharts');
export const MISSION = new Token<string>('Mission');

export class ReactorCore {
  async [Symbol.asyncDispose]() {
    log.push('reactor scrammed');
  }
}

export class PowerRouter {
  readonly #shields: () => ShieldGrid;
  constructor(shields: () => ShieldGrid) {
    this.#shields = shields;
  }
  // run.ts calls this method on the instance the container resolves, which
  // Handles['router'] types by the token's interface. fallow's static call
  // graph cannot trace that call back to this class member.
  // fallow-ignore-next-line unused-class-member
  divert() {
    return this.#shields().draw();
  }
}

export class ShieldGrid {
  readonly router: PowerRouter;
  constructor(router: PowerRouter) {
    this.router = router;
  }
  // PowerRouter calls this through a lazy() thunk the container resolves at
  // runtime, which fallow's static call graph cannot trace.
  // fallow-ignore-next-line unused-class-member
  draw() {
    return 0.4;
  }
}

/** The two handles every variant resolves the same way; each variant adds its own `bridge`. */
export function makeHandles(bridge: Handles['bridge']): Handles {
  return { bridge, router: PowerRouter, mission: MISSION };
}
