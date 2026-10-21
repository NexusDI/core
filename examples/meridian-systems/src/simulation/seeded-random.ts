import { fnv1a32, splitmix32 } from '../physics/rng';
import { type IRandomSource, SIM_OPTIONS } from './contracts';

/**
 * splitmix32 over the seed in `SimOptions`. A fork seeds from FNV-1a of
 * `${seed}:${label}`, so its stream depends on the parent's seed and the
 * label, and draws from the parent or from other forks leave it unchanged
 * (spec §4.3).
 */
export class SeededRandom implements IRandomSource {
  static deps = [SIM_OPTIONS] as const;

  static from(seed: number): SeededRandom {
    return new SeededRandom({ seed });
  }

  private readonly seed: number;
  private state: number;

  constructor(options: { readonly seed: number }) {
    this.seed = options.seed >>> 0;
    this.state = this.seed;
  }

  next(): number {
    const step = splitmix32(this.state);
    this.state = step.state;
    return step.value / 2 ** 32;
  }

  fork(label: string): SeededRandom {
    return SeededRandom.from(fnv1a32(`${this.seed}:${label}`));
  }
}
