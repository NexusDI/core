import { describe, expect, it } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import type {
  DeckPlan,
  IRandomSource,
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from './contracts';
import { FixedStepClock } from './fixed-step-clock';
import { FixedStepLoop } from './fixed-step-loop';
import { SeededRandom } from './seeded-random';
import { ShipStateStore } from './ship-state-store';

interface Call {
  readonly name: string;
  readonly input: ShipSnapshot;
  readonly output: ShipSnapshot;
  readonly tick: TickContext;
  readonly draw: number;
}

function probe(
  name: string,
  phase: Phase,
  calls: Call[],
  stamp?: Partial<ShipSnapshot>,
): IShipSystem {
  return {
    name,
    phase,
    step(ship, tick) {
      const output = { ...ship, ...stamp };
      calls.push({ name, input: ship, output, tick, draw: tick.rng.next() });
      return output;
    },
  };
}

function build(systems: IShipSystem[]) {
  const clock = new FixedStepClock({ dt: 0.5 });
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const rng = new SeededRandom({ seed: 7 });
  return { clock, state, loop: new FixedStepLoop(clock, state, rng, systems) };
}

function draw(source: IRandomSource, count: number): number[] {
  return Array.from({ length: count }, () => source.next());
}

describe('FixedStepLoop', () => {
  it('runs the systems by phase, then by name', () => {
    const calls: Call[] = [];
    const { loop } = build([
      probe('b', 4, calls),
      probe('z', 1, calls),
      probe('a', 4, calls),
    ]);
    loop.advance(1);
    expect(calls.map((call) => call.name)).toEqual(['z', 'a', 'b']);
  });

  it('hands each system the snapshot the previous one returned', () => {
    const calls: Call[] = [];
    const { state, loop } = build([
      probe('b', 4, calls),
      probe('z', 1, calls),
      probe('a', 4, calls),
    ]);
    const start = state.snapshot();
    loop.advance(1);
    expect(calls[0].input).toBe(start);
    expect(calls[1].input).toBe(calls[0].output);
    expect(calls[2].input).toBe(calls[1].output);
  });

  it('gives each system the fork for its name, made once', () => {
    const calls: Call[] = [];
    const { loop } = build([probe('a', 4, calls), probe('b', 4, calls)]);
    loop.advance(2);

    const root = new SeededRandom({ seed: 7 });
    for (const name of ['a', 'b']) {
      const mine = calls.filter((call) => call.name === name);
      expect(mine.map((call) => call.draw)).toEqual(draw(root.fork(name), 2));
      expect(mine[0].tick.rng).toBe(mine[1].tick.rng);
    }
  });

  it('passes the tick it computes and the clock dt to each system', () => {
    const calls: Call[] = [];
    const { loop } = build([probe('a', 4, calls)]);
    loop.advance(2);
    expect(calls.map((call) => [call.tick.tick, call.tick.dt])).toEqual([
      [1, 0.5],
      [2, 0.5],
    ]);
  });

  it('stamps tick and time after the systems run', () => {
    const calls: Call[] = [];
    const { state, loop } = build([
      probe('a', 4, calls, { tick: 999, time: -1 }),
    ]);
    const ship = loop.advance(1);
    expect(ship.tick).toBe(1);
    expect(ship.time).toBe(0.5);
    expect(state.snapshot()).toBe(ship);
  });

  it('returns tick 600 and time 300 after advance(600)', () => {
    const { clock, loop } = build([]);
    const ship = loop.advance(600);
    expect(ship.tick).toBe(600);
    expect(ship.time).toBe(300);
    expect(clock.tick).toBe(600);
  });

  it('refuses two systems with one name', () => {
    expect(() =>
      build([probe('a', 4, []), probe('b', 1, []), probe('a', 2, [])]),
    ).toThrow(/'a'/);
    expect(() => build([probe('a', 4, []), probe('a', 2, [])])).toThrow(Error);
  });

  it('changes only tick and time on an idle ship', () => {
    const { state, loop } = build([]);
    const start = state.snapshot();
    const ship = loop.advance(10);
    expect(ship).toEqual({ ...start, tick: 10, time: 5 });
    expect(ship.compartments).toBe(start.compartments);
    expect(Object.isFrozen(ship)).toBe(true);
  });
});
