import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';
import { NO_SUBSPACE_LINK_NOTICE } from '../../text';
import { shipState } from '../../../test/ship-state';
import type { IReactorCore } from '../engineering/contracts';

import type { ISubspaceLink } from './contracts';
import { PhasedArray } from './phased-array';

const link: ISubspaceLink = {
  receive: () => Promise.reject(new Error('no tick calls the link')),
  signOff: () => Promise.resolve(),
};

const reactor = (output: number): IReactorCore =>
  ({ output }) as unknown as IReactorCore;

function store() {
  return shipState(deck satisfies DeckPlan);
}

describe('PhasedArray', () => {
  it('reads linked when the graph binds a subspace link', () => {
    expect(new PhasedArray(store(), reactor(0), link).linked).toBe(true);
  });

  it('reads unlinked when the graph binds none', () => {
    expect(new PhasedArray(store(), reactor(0), undefined).linked).toBe(false);
  });

  it('queues a hail for the next tick and notices that no link carries it', () => {
    const state = store();
    expect(new PhasedArray(state, reactor(0), undefined).hail()).toEqual({
      tick: 1,
      notice: NO_SUBSPACE_LINK_NOTICE,
    });
    const ship = state.applyQueued(1);
    expect(ship.setpoints.comms).toEqual({ hail: true });
    expect(state.log()).toEqual([
      { tick: 1, change: { comms: { hail: true } } },
    ]);
  });

  it('queues a hail on a linked array with no notice', () => {
    expect(new PhasedArray(store(), reactor(0), link).hail()).toStrictEqual({
      tick: 1,
    });
  });

  it('signs off with the tick and the reactor output as it disposes', async () => {
    const reports: unknown[] = [];
    const array = new PhasedArray(store(), reactor(3e6), {
      ...link,
      signOff: (report) => {
        reports.push(report);
        return Promise.resolve();
      },
    });
    await array[Symbol.asyncDispose]();
    expect(reports).toEqual([{ tick: 0, output: 3e6 }]);
  });

  it('sends no sign-off from a dead reactor or with no link', async () => {
    const reports: unknown[] = [];
    const spy: ISubspaceLink = {
      ...link,
      signOff: (report) => {
        reports.push(report);
        return Promise.resolve();
      },
    };
    await new PhasedArray(store(), reactor(0), spy)[Symbol.asyncDispose]();
    await new PhasedArray(store(), reactor(3e6), undefined)[
      Symbol.asyncDispose
    ]();
    expect(reports).toEqual([]);
  });

  it('disposes when the relay refuses the sign-off', async () => {
    const array = new PhasedArray(store(), reactor(3e6), {
      ...link,
      signOff: () => Promise.reject(new Error('relay gone')),
    });
    await expect(array[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });
});
