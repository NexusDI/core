import { type ISimClock, SIM_OPTIONS, type SimOptions } from './contracts';

/**
 * Counts ticks of `dt` ship seconds. The clock derives the time from the
 * tick, so 600 ticks of 0.5 s read exactly 300 s. A running sum of `dt`
 * would gather a rounding error each tick.
 */
export class FixedStepClock implements ISimClock {
  static deps = [SIM_OPTIONS] as const;

  readonly dt: number;
  private current = 0;

  constructor(options: Pick<SimOptions, 'dt'>) {
    this.dt = options.dt;
  }

  get tick(): number {
    return this.current;
  }

  get time(): number {
    return this.current * this.dt;
  }

  advance(): number {
    return ++this.current;
  }
}
