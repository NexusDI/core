import { describe, expect, it } from 'vitest';

import type { ReactorRecord } from '../engineering/contracts';
import { LITHIUM_LOOP, pulseCoolant } from '../engineering/engineering-model';

import type { FtlRecord, FtlSetpoints } from './contracts';
import { FTL_SPOOL, ftlDemand, HOME_SECTOR, stepFtl } from './ftl-model';

const dt = 0.5;
const power = FTL_SPOOL.power;

const empty: FtlRecord = Object.freeze({
  status: 'idle',
  charge: 0,
  sector: HOME_SECTOR,
  jumped: null,
});
const full: FtlRecord = Object.freeze({
  status: 'charged',
  charge: FTL_SPOOL.energy,
  sector: HOME_SECTOR,
  jumped: null,
});
const unarmed: FtlSetpoints = Object.freeze({ armed: false, jump: null });
const armed: FtlSetpoints = Object.freeze({ armed: true, jump: null });

const reactorAt = (level: number): ReactorRecord =>
  Object.freeze({ level, thermal: 0, electric: 0, tripped: false });
const coolantAt = (temperature: number) => Object.freeze({ temperature });

/** One FTL step at `tick` with `allocated` W from the router. */
function step(
  ftl: FtlRecord,
  setpoints: FtlSetpoints,
  allocated: number,
  tick = 1,
) {
  return stepFtl(ftl, setpoints, { tick, dt, allocated }, FTL_SPOOL);
}

/** The record after `ticks` armed steps at the spool's full power. */
function spool(ticks: number): FtlRecord {
  let ftl = empty;
  for (let tick = 1; tick <= ticks; tick++) {
    ftl = step(ftl, armed, power, tick).ftl;
  }
  return ftl;
}

describe('stepFtl', () => {
  it('charges 450,000,000 J a tick and holds 90,000,000,000 J exactly after 200 ticks', () => {
    expect(spool(1).charge).toBe(450_000_000);
    expect(spool(199).charge).toBe(89_550_000_000);
    expect(spool(200).charge).toBe(90_000_000_000);
  });

  it('keeps the full charge on the 201st tick', () => {
    const charged = spool(200);
    const next = step(charged, armed, power, 201);
    expect(next.ftl).toBe(charged);
    expect(next.ftl.charge).toBe(90_000_000_000);
  });

  it('returns the objects it got when idle', () => {
    const next = step(empty, unarmed, 0);
    expect(next.ftl).toBe(empty);
    expect(next.setpoints).toBe(unarmed);
    expect(next.pulse).toBe(0);
  });

  it('spools with an allocation and holds armed with none', () => {
    expect(step(empty, armed, power).ftl).toEqual({
      status: 'spooling',
      charge: 450_000_000,
      sector: HOME_SECTOR,
      jumped: null,
    });
    expect(step(empty, armed, 0).ftl).toEqual({ ...empty, status: 'held' });
  });

  it('reads charged at a full charge', () => {
    expect(spool(200).status).toBe('charged');
    expect(step(full, unarmed, 0).ftl).toBe(full);
  });

  it('jumps on a full charge and returns the pulse of 9,000,000,000 J', () => {
    const commanded = Object.freeze({ armed: true, jump: 'Kepler-442b' });
    const next = step(full, commanded, power, 301);
    expect(next.ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'Kepler-442b',
      jumped: 301,
    });
    expect(next.setpoints).toEqual({ armed: false, jump: null });
    expect(next.pulse).toBe(9_000_000_000);
  });

  it('changes nothing on a jump below a full charge', () => {
    const partial = Object.freeze({ ...empty, charge: 89_550_000_000 });
    const commanded = Object.freeze({ armed: false, jump: 'Kepler-442b' });
    const next = step(partial, commanded, 0, 150);
    expect(next.ftl).toBe(partial);
    expect(next.setpoints).toBe(commanded);
    expect(next.pulse).toBe(0);
  });

  it('writes a new idle record on the offline record with no allocation', () => {
    const offline: FtlRecord = Object.freeze({ ...empty, status: 'offline' });
    const next = step(offline, unarmed, 0);
    expect(next.ftl).not.toBe(offline);
    expect(next.ftl).toEqual(empty);
    expect(next.setpoints).toBe(unarmed);
  });

  it('freezes every record a step builds', () => {
    const spooled = step(empty, armed, power);
    const jumped = step(full, { armed: true, jump: 'Proxima-b' }, 0);
    for (const value of [spooled.ftl, jumped.ftl, jumped.setpoints]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(pulseCoolant(coolantAt(500), 1, LITHIUM_LOOP))).toBe(
      true,
    );
  });
});

describe('ftlDemand', () => {
  const demand = (
    ftl: FtlRecord,
    setpoints: FtlSetpoints,
    level: number,
    temperature: number,
  ) =>
    ftlDemand(
      ftl,
      setpoints,
      reactorAt(level),
      coolantAt(temperature),
      FTL_SPOOL,
    );

  it('asks 900,000,000 W while armed and ready below a full charge', () => {
    expect(demand(empty, armed, 0.9, 500)).toBe(900_000_000);
  });

  it('asks 0 W unarmed, at full, under level 0.9 and at 1,300 K', () => {
    expect(demand(empty, unarmed, 1, 500)).toBe(0);
    expect(demand(full, armed, 1, 500)).toBe(0);
    expect(demand(empty, armed, 0.8999999999999999, 500)).toBe(0);
    expect(demand(empty, armed, 1, 1_300)).toBe(0);
  });

  it('asks at 1,299.9 K', () => {
    expect(demand(empty, armed, 1, 1_299.9)).toBe(900_000_000);
  });
});

describe('pulseCoolant', () => {
  it('raises 500 K to 510.7913669064748 K with pulseCoolant', () => {
    const pulse = FTL_SPOOL.pulseShare * FTL_SPOOL.energy;
    expect(pulseCoolant(coolantAt(500), pulse, LITHIUM_LOOP)).toEqual({
      temperature: 510.7913669064748,
    });
  });
});
