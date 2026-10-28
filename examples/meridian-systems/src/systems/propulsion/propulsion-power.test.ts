import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import {
  driveDemand,
  PLASMA_DRIVE,
  type DriveRating,
} from '../../physics/motion';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { IMainDrive } from './contracts';
import { PropulsionPower } from './propulsion-power';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();

/** A main drive of `rating` that never queues. */
function drive(rating: DriveRating = PLASMA_DRIVE): IMainDrive {
  return {
    rating,
    throttle: () => {
      throw new Error('the power draw queues nothing');
    },
  };
}

/** The idle ship with the drive's throttle at `throttle`. */
function burning(throttle: number): ShipSnapshot {
  return {
    ...idle,
    setpoints: { ...idle.setpoints, drive: { throttle } },
  };
}

describe('PropulsionPower', () => {
  it('draws 0 W at priority 5 on the idle ship', () => {
    expect(new PropulsionPower(drive()).draw(idle)).toEqual({
      id: 'main-drive',
      priority: 5,
      demand: 0,
      heatShare: 0.4,
    });
  });

  it('draws the pure demand of the throttle', () => {
    const ship = burning(0.5);
    expect(new PropulsionPower(drive()).draw(ship).demand).toBe(
      driveDemand(ship.setpoints.drive, PLASMA_DRIVE),
    );
    expect(new PropulsionPower(drive()).draw(burning(1)).demand).toBe(
      600_000_000,
    );
  });

  it('reads the rating behind the main drive', () => {
    const rating = { ...PLASMA_DRIVE, power: 100e6 };
    expect(new PropulsionPower(drive(rating)).draw(burning(1)).demand).toBe(
      100_000_000,
    );
  });
});
