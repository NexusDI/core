import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { PowerLoad } from '../../physics/power';
import {
  type CoolantRating,
  FUSION_REACTOR,
  LITHIUM_LOOP,
} from '../../physics/thermal';
import { SeededRandom } from '../../simulation/seeded-random';
import type {
  DeckPlan,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { ICoolantLoop, IPowerRouter, IReactorCore } from './contracts';
import { EngineeringPhysics } from './engineering-physics';

/** `m · c_p` of the lithium loop, in J/K. */
const LOOP_HEAT_CAPACITY = 200_000 * 4_170;
const dt = 0.5;
const tick: TickContext = { tick: 1, dt, rng: new SeededRandom({ seed: 7 }) };

interface Running {
  readonly level: number;
  readonly throttle: number;
  readonly raised?: boolean;
  readonly coolant?: number;
  readonly tripped?: boolean;
}

/** The deck's idle ship with the reactor at `level` and the setpoints given. */
function shipAt(running: Running): ShipSnapshot {
  const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();
  return {
    ...idle,
    reactor: {
      level: running.level,
      thermal: running.level * 3.63e9,
      electric: (running.level * 3.63e9) / 3,
      tripped: running.tripped ?? false,
    },
    coolant: { temperature: running.coolant ?? 500 },
    setpoints: {
      ...idle.setpoints,
      reactor: { throttle: running.throttle },
      shields: { raised: running.raised ?? false },
    },
  };
}

/** The physics over a router that lists the shields at 200 MW when raised. */
function build(rating: CoolantRating = LITHIUM_LOOP) {
  const seen: ShipSnapshot[] = [];
  const reactor: IReactorCore = {
    output: 0,
    rating: FUSION_REACTOR,
    throttle: () => ({ tick: 1 }),
  };
  const coolant: ICoolantLoop = { rating };
  const router: IPowerRouter = {
    loads(ship): PowerLoad[] {
      seen.push(ship);
      return [
        {
          id: 'shields',
          priority: 2,
          demand: ship.setpoints.shields.raised ? 200e6 : 0,
          heatShare: 0.25,
        },
      ];
    },
    divert() {},
  };
  return { seen, physics: new EngineeringPhysics(reactor, coolant, router) };
}

describe('EngineeringPhysics', () => {
  it('runs in phase 1 as Engineering', () => {
    const { physics } = build();
    expect(physics.name).toBe('Engineering');
    expect(physics.phase).toBe(1);
  });

  it('holds the idle ship: level 0, 500 K and a lowered grid', () => {
    const { physics } = build();
    const ship = physics.step(shipAt({ level: 0, throttle: 0 }), tick);
    expect(ship.reactor).toEqual({
      level: 0,
      thermal: 0,
      electric: 0,
      tripped: false,
    });
    expect(ship.coolant).toEqual({ temperature: 500 });
    expect(ship.power).toEqual({
      output: 0,
      loads: [{ id: 'shields', priority: 2, demand: 0, allocated: 0 }],
      shed: [],
    });
  });

  it('steps the reactor toward its throttle and heats the loop by P_th − P_e', () => {
    const { physics, seen } = build();
    const before = shipAt({ level: 0, throttle: 1 });
    const ship = physics.step(before, tick);
    expect(seen).toEqual([before]);
    expect(ship.reactor.level).toBeCloseTo(0.01, 12);
    expect(ship.reactor.electric).toBeCloseTo(12.1e6, 3);
    expect(ship.power.output).toBe(ship.reactor.electric);
    expect(ship.coolant.temperature).toBeCloseTo(
      500 + (dt * (36.3e6 - 12.1e6)) / LOOP_HEAT_CAPACITY,
      9,
    );
    expect(ship.tick).toBe(before.tick);
    expect(ship.compartments).toBe(before.compartments);
  });

  it('powers the raised shields at 242 MW and adds a quarter of their draw to the loop', () => {
    const { physics } = build();
    const ship = physics.step(
      shipAt({ level: 0.2, throttle: 0.2, raised: true }),
      tick,
    );
    expect(ship.power.loads).toEqual([
      { id: 'shields', priority: 2, demand: 200e6, allocated: 200e6 },
    ]);
    expect(ship.power.shed).toEqual([]);
    expect(ship.coolant.temperature).toBeCloseTo(
      500 + (dt * (726e6 - 242e6 + 0.25 * 200e6)) / LOOP_HEAT_CAPACITY,
      9,
    );
  });

  it('sheds the raised shields at 193.6 MW and keeps their setpoint', () => {
    const { physics } = build();
    const ship = physics.step(
      shipAt({ level: 0.16, throttle: 0.16, raised: true }),
      tick,
    );
    expect(ship.power.loads).toEqual([
      { id: 'shields', priority: 2, demand: 200e6, allocated: 0 },
    ]);
    expect(ship.power.shed).toEqual(['shields']);
    expect(ship.setpoints.shields).toEqual({ raised: true });
    expect(ship.coolant.temperature).toBeCloseTo(
      500 + (dt * (580.8e6 - 193.6e6)) / LOOP_HEAT_CAPACITY,
      9,
    );
  });

  it('trips the reactor on a 1,450 K loop and writes its throttle to 0', () => {
    const { physics } = build();
    const ship = physics.step(
      shipAt({ level: 1, throttle: 1, coolant: 1_450 }),
      tick,
    );
    expect(ship.reactor.tripped).toBe(true);
    expect(ship.reactor.level).toBeCloseTo(0.99, 12);
    expect(ship.setpoints.reactor).toEqual({ throttle: 0 });
  });

  it('trips the reactor on a loop that reaches the trip during the tick', () => {
    const { physics } = build({ ...LITHIUM_LOOP, trip: 500.01 });
    const ship = physics.step(shipAt({ level: 0, throttle: 1 }), tick);
    expect(ship.coolant.temperature).toBeCloseTo(500.0145, 4);
    expect(ship.reactor.tripped).toBe(true);
    expect(ship.reactor.level).toBeCloseTo(0.01, 12);
    expect(ship.setpoints.reactor).toEqual({ throttle: 0 });
  });

  it('holds a tripped reactor at throttle 0 after the loop cools', () => {
    const { physics } = build();
    const ship = physics.step(
      shipAt({ level: 0.5, throttle: 1, coolant: 900, tripped: true }),
      tick,
    );
    expect(ship.reactor.tripped).toBe(true);
    expect(ship.reactor.level).toBeCloseTo(0.49, 12);
    expect(ship.setpoints.reactor).toEqual({ throttle: 0 });
  });

  it('leaves the throttle setpoint alone below the trip', () => {
    const { physics } = build();
    const before = shipAt({ level: 1, throttle: 1, coolant: 1_449 });
    const ship = physics.step(before, tick);
    expect(ship.reactor.tripped).toBe(false);
    expect(ship.setpoints).toBe(before.setpoints);
  });
});
