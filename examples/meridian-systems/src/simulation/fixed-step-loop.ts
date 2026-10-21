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
 * Runs the ship systems once per tick in ascending phase, each on the
 * snapshot the previous one returned, then commits the result and advances
 * the clock (spec §4.2, steps 2 and 3).
 */
export class FixedStepLoop implements ITickLoop {
  static deps = [SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)] as const;

  private readonly entries: readonly Entry[];
  /** Each `listen` adds its own wrapper, so one function listened twice hears twice. */
  private readonly listeners = new Set<TickListener>();

  constructor(
    private readonly clock: ISimClock,
    private readonly state: IShipState,
    rng: IRandomSource,
    systems: IShipSystem[],
  ) {
    const names = new Set<string>();
    for (const system of systems) {
      if (names.has(system.name)) {
        throw new Error(`Two ship systems are named '${system.name}'.`);
      }
      names.add(system.name);
    }
    // `all()` returns the systems in registration order, so the loop sorts
    // them by phase and then by name. `<` compares UTF-16 code units and gives
    // one order on every engine. `localeCompare` follows the host locale.
    this.entries = [...systems]
      .sort(
        (a, b) =>
          a.phase - b.phase || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      )
      .map((system) => ({ system, rng: rng.fork(system.name) }));
  }

  advance(ticks: number): ShipSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new RangeError(
        `advance() takes a whole number of ticks, 0 or more, and got ${ticks}.`,
      );
    }
    for (let i = 0; i < ticks; i++) {
      const tick = this.clock.tick + 1;
      let ship = this.state.snapshot();
      for (const { system, rng } of this.entries) {
        ship = system.step(ship, { tick, dt: this.clock.dt, rng });
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

  listen(listener: TickListener): () => void {
    const entry: TickListener = (ship) => listener(ship);
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  /**
   * Walks the listeners present when the tick began and skips one removed
   * since, so a listener added during a tick first hears the next one.
   */
  private *liveListeners(): Generator<TickListener> {
    for (const entry of [...this.listeners]) {
      if (this.listeners.has(entry)) yield entry;
    }
  }
}
