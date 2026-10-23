import { all } from '@nexusdi/core';
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

interface Entry {
  readonly system: IShipSystem;
  readonly rng: IRandomSource;
}

/**
 * Applies the queued setpoint changes, then runs the ship systems once per
 * tick in ascending phase, each on the snapshot the previous one returned,
 * then advances the clock, commits the result and calls the tick listeners
 * (spec §4.2, steps 1 to 3).
 */
export class FixedStepLoop implements ITickLoop {
  static deps = [SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)] as const;

  private entries: readonly Entry[];
  /** Each `listen` adds its own wrapper, so one function listened twice hears twice. */
  private readonly listeners = new Set<TickListener>();

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
      callAll(this.liveListeners(), this.state.snapshot());
    }
    return this.state.snapshot();
  }

  /**
   * `advance()` walks the entries a tick started with, so a system attached
   * during a tick first steps on the next one.
   */
  attach(system: IShipSystem): () => void {
    const entry = this.add(system);
    return () => {
      this.entries = this.entries.filter((other) => other !== entry);
    };
  }

  listen(listener: TickListener): () => void {
    const entry: TickListener = (ship) => listener(ship);
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  /**
   * Adds `system` with the fork for its name. `all()` returns the systems in
   * registration order, so the loop sorts them by phase and then by name. `<`
   * compares UTF-16 code units and gives one order on every engine.
   * `localeCompare` follows the host locale.
   */
  private add(system: IShipSystem): Entry {
    if (this.entries.some((entry) => entry.system.name === system.name)) {
      throw new Error(`Two ship systems are named '${system.name}'.`);
    }
    const entry = { system, rng: this.rng.fork(system.name) };
    this.entries = [...this.entries, entry].sort(
      ({ system: a }, { system: b }) =>
        a.phase - b.phase || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    return entry;
  }

  /**
   * Walks the listeners present when dispatch began and skips one removed
   * since, so a listener added during a tick first hears the next one.
   */
  private *liveListeners(): Generator<TickListener> {
    for (const entry of [...this.listeners]) {
      if (this.listeners.has(entry)) yield entry;
    }
  }
}
