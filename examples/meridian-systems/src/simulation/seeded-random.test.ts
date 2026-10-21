import { describe, expect, it } from 'vitest';
import expected from '../physics/__fixtures__/rng.seed-7.json';
import type { IRandomSource } from './contracts';
import { SeededRandom } from './seeded-random';

function draw(source: IRandomSource, count: number): number[] {
  return Array.from({ length: count }, () => source.next());
}

describe('SeededRandom', () => {
  it('divides the splitmix32 value by 2^32', () => {
    const source = new SeededRandom({ seed: 7 });
    expect(source.next()).toBe(expected[0] / 2 ** 32);
  });

  it('draws only values in [0, 1)', () => {
    for (const value of draw(new SeededRandom({ seed: 7 }), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives two sources with one seed one stream', () => {
    expect(draw(new SeededRandom({ seed: 7 }), 100)).toEqual(
      draw(new SeededRandom({ seed: 7 }), 100),
    );
  });

  it('keeps a fork stream apart from every other fork', () => {
    const alone = draw(new SeededRandom({ seed: 7 }).fork('Safety'), 100);

    const parent = new SeededRandom({ seed: 7 });
    draw(parent.fork('Weapons'), 100);
    draw(parent, 10);
    expect(draw(parent.fork('Safety'), 100)).toEqual(alone);
  });

  it('gives a fork a stream its parent does not draw', () => {
    const parent = new SeededRandom({ seed: 7 });
    const fork = parent.fork('Safety');
    expect(draw(fork, 100)).not.toEqual(draw(parent, 100));
  });
});
