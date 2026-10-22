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

  it('passes each system the snapshot of the tick before any system stepped', () => {
    const calls: Call[] = [];
    const { state, loop } = build([
      probe('a', 1, calls, { tick: 999 }),
      probe('b', 4, calls),
    ]);
    state.queue({ reactor: { throttle: 1 } });
    loop.advance(2);
    expect(calls[0].tick.start).toBe(calls[0].input);
    expect(calls[1].tick.start).toBe(calls[0].input);
    expect(calls[2].tick.start).toBe(calls[2].input);
    expect(calls[2].tick.start).not.toBe(calls[0].input);
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

  it('refuses a tick count that is not a whole number of ticks', () => {
    const { loop } = build([]);
    for (const ticks of [1.5, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => loop.advance(ticks)).toThrow(RangeError);
      expect(() => loop.advance(ticks)).toThrow(String(ticks));
    }
  });

  it('returns the current snapshot for zero ticks', () => {
    const { state, loop } = build([]);
    expect(loop.advance(0)).toBe(state.snapshot());
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

  it('applies a change queued before advance() ahead of the first system', () => {
    const calls: Call[] = [];
    const { state, loop } = build([probe('a', 1, calls), probe('b', 4, calls)]);
    state.queue({ reactor: { throttle: 1 } });
    loop.advance(1);
    expect(calls[0].input.setpoints.reactor.throttle).toBe(1);
    expect(state.log()).toEqual([
      { tick: 1, change: { reactor: { throttle: 1 } } },
    ]);
  });

  it('applies a change queued between two ticks at the second', () => {
    const calls: Call[] = [];
    const { state, loop } = build([probe('a', 1, calls)]);
    loop.advance(1);
    expect(state.queue({ shields: { raised: true } })).toEqual({ tick: 2 });
    loop.advance(1);
    expect(calls.map((call) => call.input.setpoints.shields.raised)).toEqual([
      false,
      true,
    ]);
    expect(state.log()).toEqual([
      { tick: 2, change: { shields: { raised: true } } },
    ]);
  });

  describe('listen', () => {
    it('calls a listener with each committed snapshot after the systems ran', () => {
      const calls: Call[] = [];
      const { state, loop } = build([probe('a', 4, calls)]);
      const heard: ShipSnapshot[] = [];
      loop.listen((ship) => {
        expect(calls).toHaveLength(ship.tick);
        expect(state.snapshot()).toBe(ship);
        heard.push(ship);
      });
      loop.advance(2);
      expect(heard.map((ship) => ship.tick)).toEqual([1, 2]);
    });

    it('calls the listeners in subscription order', () => {
      const { loop } = build([]);
      const heard: string[] = [];
      loop.listen(() => heard.push('first'));
      loop.listen(() => heard.push('second'));
      loop.advance(1);
      expect(heard).toEqual(['first', 'second']);
    });

    it('counts one function listened twice as two listeners', () => {
      const { loop } = build([]);
      const heard: number[] = [];
      const listener = (ship: ShipSnapshot) => heard.push(ship.tick);
      loop.listen(listener);
      loop.listen(listener);
      loop.advance(1);
      expect(heard).toEqual([1, 1]);
    });

    it('stops a listener at its unsubscribe, which runs twice safely', () => {
      const { loop } = build([]);
      const heard: number[] = [];
      const listener = (ship: ShipSnapshot) => heard.push(ship.tick);
      const stop = loop.listen(listener);
      loop.listen(listener);
      loop.advance(1);
      stop();
      stop();
      loop.advance(1);
      expect(heard).toEqual([1, 1, 2]);
    });

    it('skips a listener that an earlier one removed during the tick', () => {
      const { loop } = build([]);
      const heard: number[] = [];
      let stopLater = () => {};
      loop.listen(() => stopLater());
      stopLater = loop.listen((ship) => heard.push(ship.tick));
      loop.advance(2);
      expect(heard).toEqual([]);
    });

    it('calls a listener added during a tick from the next tick on', () => {
      const { loop } = build([]);
      const heard: number[] = [];
      let added = false;
      loop.listen(() => {
        if (added) return;
        added = true;
        loop.listen((ship) => heard.push(ship.tick));
      });
      loop.advance(2);
      expect(heard).toEqual([2]);
    });

    it('runs the other listeners, keeps the tick and stops advance after one throws', () => {
      const { clock, state, loop } = build([]);
      const boom = new Error('boom');
      const heard: number[] = [];
      loop.listen(() => {
        throw boom;
      });
      loop.listen((ship) => heard.push(ship.tick));
      expect(() => loop.advance(3)).toThrow(boom);
      expect(heard).toEqual([1]);
      expect(state.snapshot().tick).toBe(1);
      expect(clock.tick).toBe(1);
    });

    it('throws an AggregateError when two listeners throw', () => {
      const { loop } = build([]);
      const first = new Error('first');
      const second = new Error('second');
      loop.listen(() => {
        throw first;
      });
      loop.listen(() => {
        throw second;
      });
      let error: unknown;
      try {
        loop.advance(1);
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([first, second]);
    });
  });
});
