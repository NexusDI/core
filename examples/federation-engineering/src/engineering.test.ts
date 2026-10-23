import { Nexus, defineModule, provide } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import {
  TELEMETRY_FEED,
  type IStationTelemetry,
  type TelemetryReading,
  type TelemetryState,
} from '@nexusdi/federation-contracts';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it } from 'vitest';

import { ENGINE_ROOM, EngineeringStation } from './engineering-station.module';

const compartments = {
  bridge: { temperature: 293, pressure: 101300, moles: { O2: 524 } },
};

/** The idle ship at seed 7: reactor cold, coolant at 500 K, nothing allocated. */
const idle: TelemetryReading = {
  tick: 0,
  reactor: { level: 0, electric: 0 },
  coolant: { temperature: 500 },
  power: {
    loads: [
      { id: 'life-support', allocated: 0 },
      { id: 'shields', allocated: 0 },
    ],
    shed: [],
  },
  compartments,
};

/** A running reactor with the weapons shed. */
const powered: TelemetryReading = {
  tick: 40,
  reactor: { level: 0.75, electric: 1_234_567_890 },
  coolant: { temperature: 612.34 },
  power: {
    loads: [
      { id: 'life-support', allocated: 1_500_000 },
      { id: 'shields', allocated: 2_250_000 },
    ],
    shed: ['railgun', 'main-drive'],
  },
  compartments,
};

const online = (reading: TelemetryReading | null): TelemetryState => ({
  status: 'online',
  reading,
});

const listened: (() => void)[] = [];
const current = online(idle);
const feed: IStationTelemetry = {
  subscribe: (listener) => {
    listened.push(listener);
    return () => {};
  },
  state: () => current,
};

/** What the shell's Tactical gives a loaded remote: a global TELEMETRY_FEED. */
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(TELEMETRY_FEED, { useValue: feed })],
  exports: [TELEMETRY_FEED],
  global: true,
});

const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, EngineeringStation],
});

describe('EngineeringStation', () => {
  it('reads the idle ship in SI', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    expect(ship.get(ENGINE_ROOM).gauges(online(idle))).toEqual([
      ['Reactor level', '0.00'],
      ['Electric output', '0.0 MW'],
      ['Coolant', '500.0 K'],
      ['Power allocated', '0.0 MW'],
      ['Loads shed', 'none'],
    ]);
  });

  it('reads a powered ship, grouping thousands', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    expect(ship.get(ENGINE_ROOM).gauges(online(powered))).toEqual([
      ['Reactor level', '0.75'],
      ['Electric output', '1,234.6 MW'],
      ['Coolant', '612.3 K'],
      ['Power allocated', '3.8 MW'],
      ['Loads shed', 'railgun, main-drive'],
    ]);
  });

  it('has no gauges before the first reading', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    expect(ship.get(ENGINE_ROOM).gauges(online(null))).toBeNull();
  });

  it('passes the feed through', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    const { subscribe: follow, state: read } = ship.get(ENGINE_ROOM);
    const listener = () => {};
    follow(listener);
    expect(listened).toEqual([listener]);
    expect(read()).toBe(current);
  });

  it('passes Nexus.check with federation()', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: [federation()] }),
    ).not.toThrow();
  });
});
