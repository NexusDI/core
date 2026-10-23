import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { FTL_SPOOL, ftlDemand } from '../../physics/ftl';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { FtlPower } from './ftl-power';

const start = new ShipStateStore(deck satisfies DeckPlan).snapshot();

/** The ship armed with the reactor at full. */
const ready: ShipSnapshot = {
  ...start,
  reactor: { ...start.reactor, level: 1 },
  setpoints: { ...start.setpoints, ftl: { armed: true, jump: null } },
};

describe('FtlPower', () => {
  it('draws 0 W at priority 7 on the ship at the start', () => {
    expect(new FtlPower(FTL_SPOOL).draw(start)).toEqual({
      id: 'ftl-spool',
      priority: 7,
      demand: 0,
      heatShare: 0.1,
    });
  });

  it('draws the pure demand of the armed spool', () => {
    expect(new FtlPower(FTL_SPOOL).draw(ready).demand).toBe(
      ftlDemand(
        ready.ftl,
        ready.setpoints.ftl,
        ready.reactor,
        ready.coolant,
        FTL_SPOOL,
      ),
    );
    expect(new FtlPower(FTL_SPOOL).draw(ready).demand).toBe(900_000_000);
  });

  it('reads the rating it was built with', () => {
    const rating = { ...FTL_SPOOL, power: 100e6 };
    expect(new FtlPower(rating).draw(ready).demand).toBe(100_000_000);
  });
});
