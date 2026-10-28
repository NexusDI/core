import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { BadCommandError } from '../../errors';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import { LIFE_SUPPORT_ACTIONS } from './contracts';
import { EnvironmentalController } from './environmental-controller';

function build() {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  return { state, control: new EnvironmentalController(state) };
}

describe('EnvironmentalController', () => {
  it('queues life support online for the next tick', () => {
    const { state, control } = build();
    expect(control.online()).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.lifeSupport.online).toBe(true);
  });

  it('queues life support offline for the next tick', () => {
    const { state, control } = build();
    control.online();
    state.applyQueued(1);
    expect(state.snapshot().setpoints.lifeSupport.online).toBe(true);
    expect(control.offline()).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.lifeSupport.online).toBe(false);
  });

  it('queues a heater target and keeps the heater on', () => {
    const { state, control } = build();
    expect(control.heater('habitat', { target: 295 })).toEqual({ tick: 1 });
    const { heaters } = state.applyQueued(1).setpoints.lifeSupport;
    expect(heaters.habitat).toEqual({ on: true, target: 295 });
    expect(heaters.bridge).toEqual({ on: true, target: 293 });
  });

  it('queues each device setpoint', () => {
    const { state, control } = build();
    control.heater('bridge', { on: false });
    control.scrubber('habitat', false);
    control.oxygen('bridge', false);
    control.vent('airlock', true);
    control.pump('airlock', 'evacuate');
    const lifeSupport = state.applyQueued(1).setpoints.lifeSupport;
    expect(lifeSupport).toEqual({
      online: false,
      heaters: {
        bridge: { on: false, target: 293 },
        habitat: { on: true, target: 293 },
      },
      scrubbers: { bridge: true, habitat: false },
      oxygen: { bridge: false, habitat: true },
      vents: { airlock: true },
      pumps: { airlock: 'evacuate' },
    });
  });

  it.each([
    [
      'a heater in the airlock',
      (c: EnvironmentalController) => c.heater('airlock', { on: true }),
      'heater',
    ],
    [
      'a scrubber in the reactor bay',
      (c: EnvironmentalController) => c.scrubber('reactor-bay', true),
      'scrubber',
    ],
    [
      'a generator in the airlock',
      (c: EnvironmentalController) => c.oxygen('airlock', true),
      'oxygen',
    ],
    [
      'a vent in the habitat',
      (c: EnvironmentalController) => c.vent('habitat', true),
      'vent',
    ],
    [
      'a pump in the habitat',
      (c: EnvironmentalController) => c.pump('habitat', 'fill'),
      'pump',
    ],
    [
      'a heater in the galley',
      (c: EnvironmentalController) => c.heater('galley', { on: true }),
      'heater',
    ],
    [
      'a heater on the prototype',
      (c: EnvironmentalController) => c.heater('constructor', { on: true }),
      'heater',
    ],
  ] as const)('refuses %s and queues nothing', (_name, command, action) => {
    const { state, control } = build();
    let error: unknown;
    try {
      command(control);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(BadCommandError);
    expect(error).toMatchObject({
      reason: 'argument',
      system: 'life-support',
      action,
      argument: 'compartment',
      expected: LIFE_SUPPORT_ACTIONS,
    });
    state.applyQueued(1);
    expect(state.log()).toEqual([]);
  });
});
