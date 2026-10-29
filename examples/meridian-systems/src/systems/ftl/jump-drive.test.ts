import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import {
  BadCommandError,
  FtlNotSpooledError,
  PowerBudgetError,
} from '../../errors';
import type { ICommandDesk } from '../../simulation/commands';
import type { DeckPlan, ITickLoop } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { IPowerRouter, PowerLoad } from '../engineering/contracts';
import { BUNDLED_CHARTS, StarCharts } from '../tactical/star-charts';

import { FTL_ACTIONS } from './contracts';
import { FtlCommands } from './ftl-commands';
import { FTL_SPOOL } from './ftl-model';
import { FtlPhysics } from './ftl-physics';
import { FtlPower } from './ftl-power';
import { JumpDrive } from './jump-drive';

/** A drive over fakes of the loop, the router and the desk that record what it asks. */
function build(refuse = false) {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const registered: string[] = [];
  const unregistered: string[] = [];
  const diverted: PowerLoad[] = [];
  const join = (bus: string) => {
    registered.push(bus);
    return () => void unregistered.push(bus);
  };
  const loop: ITickLoop = {
    advance: () => state.snapshot(),
    listen: () => () => {},
    register: () => join('loop'),
  };
  const router: IPowerRouter = {
    loads: () => [],
    register: () => join('router'),
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
  const desk: ICommandDesk = {
    submit: () => ({ tick: 0 }),
    register: () => join('desk'),
  };
  const physics = new FtlPhysics();
  const power = new FtlPower();
  // The thunk reads the drive once a command arrives, after the build.
  const commands = new FtlCommands(() => drive);
  const drive: JumpDrive = new JumpDrive(
    loop,
    state,
    new StarCharts(BUNDLED_CHARTS),
    router,
    desk,
    physics,
    power,
    commands,
  );
  return { state, registered, unregistered, diverted, drive };
}

/** Commits the store's snapshot with the spool holding `charge` J. */
function charged(state: ShipStateStore, charge: number): void {
  const ship = state.snapshot();
  state.commit({
    ...ship,
    ftl: { status: 'spooling', charge, sector: 'Sol', jumped: null },
  });
}

describe('JumpDrive', () => {
  it('reads the FTL spool rating', () => {
    expect(build().drive.rating).toBe(FTL_SPOOL);
  });

  it('registers with the loop, the router and the desk on init and unregisters in reverse on dispose', () => {
    const { registered, unregistered, drive } = build();
    expect(registered).toEqual([]);
    drive.onInit();
    expect(registered).toEqual(['loop', 'router', 'desk']);
    drive[Symbol.dispose]();
    drive[Symbol.dispose]();
    expect(unregistered).toEqual(['desk', 'router', 'loop']);
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
          argument: 'to',
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
