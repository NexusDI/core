import { defineModule, provide } from '@nexusdi/core';
import {
  type ITickLoop,
  SIM_OPTIONS,
  type ShipSnapshot,
  type SimOptions,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';

import {
  DRIVER_OPTIONS,
  type DriverOptions,
  type ISimDriver,
  SIM_DRIVER,
  type SimMode,
} from './contracts';

/**
 * Advances the loop one tick every `dt` seconds of wall time in live mode,
 * and only on `advance()` in manual mode. Its interval is the one timer in
 * the demo, and the container clears it when it disposes the ship.
 */
class WallClockDriver implements ISimDriver, Disposable {
  static deps = [TICK_LOOP, SIM_OPTIONS, DRIVER_OPTIONS] as const;

  readonly mode: SimMode;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly loop: ITickLoop,
    private readonly sim: SimOptions,
    options: DriverOptions,
  ) {
    this.mode = options.mode;
  }

  onInit(): void {
    if (this.mode === 'live') {
      this.timer = setInterval(() => this.loop.advance(1), this.sim.dt * 1000);
    }
  }

  advance(ticks: number): ShipSnapshot {
    return this.loop.advance(ticks);
  }

  [Symbol.dispose](): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

export const SimDriver = defineModule({
  name: 'SimDriver',
  options: DRIVER_OPTIONS,
  providers: [provide(SIM_DRIVER, { useClass: WallClockDriver })],
  exports: [SIM_DRIVER],
});
