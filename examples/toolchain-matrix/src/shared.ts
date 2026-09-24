import { Token } from '@nexusdi/core';

import type { Handles } from './run.ts';

/**
 * Held here rather than in each variant's meridian.ts (D9): the plain and
 * decorated variants (Task 34) wire the same graph through different
 * provider registration, but everything that has no decorator-shaped
 * difference -- the log sink, the tokens, and the classes whose constructor
 * parameters are all self-tokens -- is one module both import.
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
  // @nexusdi/core's container constructs PowerRouter and calls this method
  // through the resolved instance run.ts holds as Handles['router'], typed by
  // the token's interface rather than by this class, so fallow's static call
  // graph cannot trace the call back to this member.
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
  // Called only through the lazy() thunk PowerRouter resolves at runtime;
  // see the comment on PowerRouter.divert.
  // fallow-ignore-next-line unused-class-member
  draw() {
    return 0.4;
  }
}

/** The two handles every variant resolves the same way; each variant adds its own `bridge`. */
export function makeHandles(bridge: Handles['bridge']): Handles {
  return { bridge, router: PowerRouter, mission: MISSION };
}
