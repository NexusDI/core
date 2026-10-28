import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { IWeaponMount, RailgunRating } from './contracts';
import { RAILGUN, railgunDemand } from './weapons-model';
import { WeaponsPower } from './weapons-power';

const start = new ShipStateStore(deck satisfies DeckPlan).snapshot();

/** A mount of `rating` that never fires. */
function mount(rating: RailgunRating = RAILGUN): IWeaponMount {
  return {
    rating,
    fire: () => {
      throw new Error('the power draw fires nothing');
    },
  };
}

/** The ship at the start, armed, with the capacitor at `charge` J. */
function armed(charge: number): ShipSnapshot {
  return {
    ...start,
    weapons: { ...start.weapons, status: 'charging', charge },
    setpoints: {
      ...start.setpoints,
      weapons: { armed: true, range: 10_000 },
    },
  };
}

describe('WeaponsPower', () => {
  it('draws 0 W at priority 6 on the ship at the start', () => {
    expect(new WeaponsPower(mount(), { dt: 0.5 }).draw(start)).toEqual({
      id: 'railgun',
      priority: 6,
      demand: 0,
      heatShare: 0,
    });
  });

  it('draws the pure demand of the armed capacitor at the dt of SimOptions', () => {
    const ship = armed(300e6);
    expect(new WeaponsPower(mount(), { dt: 0.5 }).draw(ship).demand).toBe(
      200_000_000,
    );
    expect(new WeaponsPower(mount(), { dt: 1 }).draw(ship).demand).toBe(
      railgunDemand(ship.weapons, ship.setpoints.weapons, RAILGUN, 1),
    );
    expect(new WeaponsPower(mount(), { dt: 1 }).draw(ship).demand).toBe(
      100_000_000,
    );
  });

  it('reads the rating behind the mount', () => {
    const rating = { ...RAILGUN, power: 100e6 };
    const draw = new WeaponsPower(mount(rating), { dt: 0.5 }).draw(armed(0));
    expect(draw.demand).toBe(100_000_000);
  });
});
