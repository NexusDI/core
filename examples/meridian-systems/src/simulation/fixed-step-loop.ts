import { all } from '@nexusdi/core';

import { byCodeUnit } from './by-code-unit';
import { callAll } from './call-all';
import {
  type IRandomSource,
  type ISimClock,
  type IShipState,
  type IShipSystem,
  type ITickLoop,
  RNG,
  SHIP_STATE,
  SHIP_SYSTEMS,
  SIM_CLOCK,
  type ShipSnapshot,
  type TickListener,
} from './contracts';
import { Subscribers } from './subscribers';

interface Entry {
  readonly system: IShipSystem;
  readonly rng: IRandomSource;
}

/**
 * Applies the queued setpoint changes, then runs the ship systems once per
 * tick in ascending phase, each on the snapshot the previous one returned,
 * then advances the clock, commits the result and calls the tick listeners.
 */
export class FixedStepLoop implements ITickLoop {
  static deps = [SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)] as const;

  private entries: readonly Entry[];
  /** Each `listen` adds its own entry, so one function listened twice hears twice. */
  private readonly listeners = new Subscribers<TickListener>();

  constructor(
    private readonly clock: ISimClock,
    private readonly state: IShipState,
    private readonly rng: IRandomSource,
    systems: IShipSystem[],
  ) {
    this.entries = [];
    for (const system of systems) this.add(system);
  }

  advance(ticks: number): ShipSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new RangeError(
        `advance() takes a whole number of ticks, 0 or more, and got ${ticks}.`,
      );
    }
    for (let i = 0; i < ticks; i++) {
      const tick = this.clock.tick + 1;
      const start = this.state.applyQueued(tick);
      let ship = start;
      for (const { system, rng } of this.entries) {
        ship = system.step(ship, { tick, dt: this.clock.dt, rng, start });
      }
      this.clock.advance();
      this.state.commit(
        Object.freeze({
          ...ship,
          tick: this.clock.tick,
          time: this.clock.time,
        }),
      );
      callAll(this.listeners, this.state.snapshot());
    }
    return this.state.snapshot();
  }

  /**
   * `advance()` walks the entries a tick started with, so a system registered
   * during a tick first steps on the next one.
   */
  register(system: IShipSystem): () => void {
    const entry = this.add(system);
    return () => {
      this.entries = this.entries.filter((other) => other !== entry);
    };
  }

  /**
   * A listener added during a tick first hears the next one, and one removed
   * during a tick before its turn does not hear that tick.
   */
  listen(listener: TickListener): () => void {
    return this.listeners.add(listener);
  }

  /**
   * Adds `system` with the fork for its name. `all()` returns the systems in
   * registration order, so the loop sorts them by phase and then by name in
   * code-unit order.
   */
  private add(system: IShipSystem): Entry {
    if (this.entries.some((entry) => entry.system.name === system.name)) {
      throw new Error(`Two ship systems are named '${system.name}'.`);
    }
    const entry = { system, rng: this.rng.fork(system.name) };
    this.entries = [...this.entries, entry].sort(
      ({ system: a }, { system: b }) =>
        a.phase - b.phase || byCodeUnit(a.name, b.name),
    );
    return entry;
  }
}
