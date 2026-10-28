import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { HULL } from '../../physics/constants';

import type { IThrusters, ThrusterRating } from './contracts';
import { RCS_THRUSTERS, thrustersDemand } from './helm-model';
import { HelmPower } from './helm-power';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();

/** Thrusters of `rating` that never queue. */
function thrusters(rating: ThrusterRating = RCS_THRUSTERS): IThrusters {
  return {
    rating,
    steer: () => {
      throw new Error('the power draw queues nothing');
    },
  };
}

/** The idle ship steering for `heading` rad from rest. */
function steering(heading: number): ShipSnapshot {
  return {
    ...idle,
    setpoints: { ...idle.setpoints, helm: { heading } },
  };
}

describe('HelmPower', () => {
  it('draws 0 W at priority 4 on the idle ship', () => {
    expect(new HelmPower(thrusters()).draw(idle)).toEqual({
      id: 'thrusters',
      priority: 4,
      demand: 0,
      heatShare: 0,
    });
  });

  it('draws 20,000,000 W for a turn at full torque', () => {
    const ship = steering(Math.PI);
    expect(new HelmPower(thrusters()).draw(ship).demand).toBe(20_000_000);
  });

  it('draws the pure demand of the start-of-tick helm', () => {
    const ship: ShipSnapshot = {
      ...steering(0.3),
      helm: { attitude: 0.2, rate: 0.001, torque: 0 },
    };
    expect(new HelmPower(thrusters()).draw(ship).demand).toBe(
      thrustersDemand(ship.helm, ship.setpoints.helm, RCS_THRUSTERS, HULL),
    );
  });

  it('reads the rating behind the thrusters', () => {
    const rating = { maxTorque: 5e6, power: 10e6 };
    const ship = steering(Math.PI);
    expect(new HelmPower(thrusters(rating)).draw(ship).demand).toBe(10_000_000);
  });
});
