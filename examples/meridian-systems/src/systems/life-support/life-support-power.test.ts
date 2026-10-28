import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import { LIFE_SUPPORT_RATINGS, lifeSupportDemand } from './life-support-model';
import { LifeSupportPower } from './life-support-power';

const plan = deck satisfies DeckPlan;
const power = new LifeSupportPower(
  { calibration, ratings: LIFE_SUPPORT_RATINGS },
  plan,
);

describe('LifeSupportPower', () => {
  it('draws 0 W at priority 1 while offline', () => {
    expect(power.draw(new ShipStateStore(plan).snapshot())).toEqual({
      id: 'life-support',
      priority: 1,
      demand: 0,
      heatShare: 0,
    });
  });

  it('draws what lifeSupportDemand gives online', () => {
    const idle = new ShipStateStore(plan).snapshot();
    const ship = {
      ...idle,
      setpoints: {
        ...idle.setpoints,
        lifeSupport: { ...idle.setpoints.lifeSupport, online: true },
      },
    };
    const demand = lifeSupportDemand(
      ship.compartments,
      plan.compartments,
      ship.setpoints.lifeSupport,
      LIFE_SUPPORT_RATINGS,
    );
    // The initial air sits at the 293 K target and holds 21,273 Pa of O₂, over
    // the generators' 21 kPa, so only the two scrubbers draw, 1,200 W each.
    expect(demand).toBe(2_400);
    expect(power.draw(ship)).toEqual({
      id: 'life-support',
      priority: 1,
      demand,
      heatShare: 0,
    });
  });
});
