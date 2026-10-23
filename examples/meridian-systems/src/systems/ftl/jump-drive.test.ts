import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import {
  BadCommandError,
  FtlNotSpooledError,
  PowerBudgetError,
} from '../../errors';
import { FTL_SPOOL } from '../../physics/ftl';
import type { PowerLoad } from '../../physics/power';
import type {
  DeckPlan,
  IShipSystem,
  ITickLoop,
} from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { IPowerConsumer, IPowerRouter } from '../engineering/contracts';
import { BUNDLED_CHARTS, StarCharts } from '../tactical/star-charts';
import { FTL_ACTIONS } from './contracts';
import { FtlPhysics } from './ftl-physics';
import { FtlPower } from './ftl-power';
import { JumpDrive } from './jump-drive';

/** A drive over fakes of the loop and the router that record what it asks. */
function build(refuse = false) {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const systems: IShipSystem[] = [];
  const consumers: IPowerConsumer[] = [];
  const diverted: PowerLoad[] = [];
  const detached: string[] = [];
  const loop: ITickLoop = {
    advance: () => state.snapshot(),
    listen: () => () => {},
    attach(system) {
      systems.push(system);
      return () => void detached.push('system');
    },
  };
  const router: IPowerRouter = {
    loads: () => [],
    attach(consumer) {
      consumers.push(consumer);
      return () => void detached.push('consumer');
    },
    divert(load) {
      diverted.push(load);
      if (refuse) {
        throw new PowerBudgetError({
          consumer: load.id,
          demand: load.demand,
          available: 0,
        });
      }
    },
  };
  const drive = new JumpDrive(
    loop,
    state,
    new StarCharts(BUNDLED_CHARTS),
    router,
  );
  return { state, systems, consumers, diverted, detached, drive };
}

/** Commits the store's snapshot with the spool holding `charge` J. */
function charged(state: ShipStateStore, charge: number): void {
  const ship = state.snapshot();
  state.commit({ ...ship, ftl: { ...ship.ftl, charge } });
}

describe('JumpDrive', () => {
  it('reads the FTL spool rating', () => {
    expect(build().drive.rating).toBe(FTL_SPOOL);
  });

  it('attaches one system and one consumer on init and detaches both on dispose', () => {
    const { systems, consumers, detached, drive } = build();
    expect(systems).toEqual([]);
    drive.onInit();
    expect(systems).toHaveLength(1);
    expect(systems[0]).toBeInstanceOf(FtlPhysics);
    expect(consumers).toHaveLength(1);
    expect(consumers[0]).toBeInstanceOf(FtlPower);
    drive[Symbol.dispose]();
    expect(detached).toEqual(['system', 'consumer']);
  });

  it('diverts the spool load, then queues the armed setpoint', () => {
    const { state, diverted, drive } = build();
    expect(drive.spool()).toEqual({ tick: 1 });
    expect(diverted).toEqual([
      { id: 'ftl-spool', priority: 7, demand: 900e6, heatShare: 0.1 },
    ]);
    expect(state.applyQueued(1).setpoints.ftl).toEqual({
      armed: true,
      jump: null,
    });
  });

  it('queues nothing when the router refuses the spool load', () => {
    const { state, drive } = build(true);
    expect(() => drive.spool()).toThrow(PowerBudgetError);
    state.applyQueued(1);
    expect(state.log()).toEqual([]);
  });

  it('asks no divert and queues nothing on an armed drive, and answers the next tick', () => {
    const { state, diverted, drive } = build();
    const ship = state.snapshot();
    state.commit({
      ...ship,
      tick: 40,
      setpoints: { ...ship.setpoints, ftl: { armed: true, jump: null } },
    });
    expect(drive.spool()).toEqual({ tick: 41 });
    expect(diverted).toEqual([]);
    state.applyQueued(41);
    expect(state.log()).toEqual([]);
  });

  it.each(['Vega', 'constructor'])(
    'refuses a jump to %s, a star the charts do not hold',
    (to) => {
      const { state, drive } = build();
      charged(state, FTL_SPOOL.energy);
      expect(() => drive.jump(to)).toThrow(BadCommandError);
      expect(() => drive.jump(to)).toThrow(
        expect.objectContaining({
          reason: 'argument',
          system: 'ftl',
          action: 'jump',
          expected: FTL_ACTIONS,
        }),
      );
    },
  );

  it('refuses an uncharted star before it reads the charge', () => {
    const { drive } = build();
    expect(() => drive.jump('Vega')).toThrow(BadCommandError);
  });

  it('refuses a jump below a full charge with the charge it holds', () => {
    const { state, drive } = build();
    charged(state, 22.5e9);
    expect(() => drive.jump('Kepler-442b')).toThrow(FtlNotSpooledError);
    expect(() => drive.jump('Kepler-442b')).toThrow(
      expect.objectContaining({ charge: 22.5e9, energy: 90e9 }),
    );
    state.applyQueued(1);
    expect(state.log()).toEqual([]);
  });

  it('queues the jump on a full charge', () => {
    const { state, drive } = build();
    charged(state, FTL_SPOOL.energy);
    expect(drive.jump('Kepler-442b')).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.ftl).toEqual({
      armed: false,
      jump: 'Kepler-442b',
    });
  });
});
