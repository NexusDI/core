import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { CommsPower } from './comms-power';
import type { ICommsArray } from './contracts';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();

/** An array that reads `linked` and never queues. */
function array(linked: boolean): ICommsArray {
  return {
    linked,
    hail: () => {
      throw new Error('the power draw queues nothing');
    },
  };
}

/** The idle ship with the comms record `comms` and the hail flag `hail`. */
function ship(comms: ShipSnapshot['comms'], hail: boolean): ShipSnapshot {
  return {
    ...idle,
    comms,
    setpoints: { ...idle.setpoints, comms: { hail } },
  };
}

const standby = idle.comms;

describe('CommsPower', () => {
  it('draws 0 W at priority 3 on the idle ship', () => {
    expect(new CommsPower(array(true)).draw(idle)).toEqual({
      id: 'comms',
      priority: 3,
      demand: 0,
      heatShare: 0,
    });
  });

  it('draws 5,000,000 W on the tick a linked array sends its hail', () => {
    expect(new CommsPower(array(true)).draw(ship(standby, true))).toEqual({
      id: 'comms',
      priority: 3,
      demand: 5_000_000,
      heatShare: 0,
    });
  });

  it('draws 0 W for a hail on an array with no link', () => {
    expect(new CommsPower(array(false)).draw(ship(standby, true)).demand).toBe(
      0,
    );
  });

  it('draws 0 W for a hail queued while the array awaits a reply', () => {
    const awaiting = {
      status: 'awaiting reply',
      sent: 1,
      messages: [],
    } as const;
    expect(new CommsPower(array(true)).draw(ship(awaiting, true)).demand).toBe(
      0,
    );
  });
});
