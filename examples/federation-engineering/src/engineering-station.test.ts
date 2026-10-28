import { Nexus } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import type {
  TelemetryReading,
  TelemetryState,
} from '@nexusdi/federation-contracts';
import {
  FAKE_TELEMETRY,
  stationRoot,
} from '@nexusdi/federation-contracts/testing';
import { nexusTest } from '@nexusdi/vitest';
import { describe, expect, test as base } from 'vitest';

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

const root = stationRoot(EngineeringStation);
const test = nexusTest(base, root);

describe('EngineeringStation', () => {
  test('reads the idle ship in SI', ({ nexus }) => {
    expect(nexus.get(ENGINE_ROOM).gauges(online(idle))).toEqual([
      ['Reactor level', '0.00'],
      ['Electric output', '0.0 MW'],
      ['Coolant', '500.0 K'],
      ['Power allocated', '0.0 MW'],
      ['Loads shed', 'none'],
    ]);
  });

  test('reads a powered ship, grouping thousands', ({ nexus }) => {
    expect(nexus.get(ENGINE_ROOM).gauges(online(powered))).toEqual([
      ['Reactor level', '0.75'],
      ['Electric output', '1,234.6 MW'],
      ['Coolant', '612.3 K'],
      ['Power allocated', '3.8 MW'],
      ['Loads shed', 'railgun, main-drive'],
    ]);
  });

  test('has no gauges before the first reading', ({ nexus }) => {
    expect(nexus.get(ENGINE_ROOM).gauges(online(null))).toBeNull();
  });

  test('passes the feed through', ({ nexus }) => {
    const feed = nexus.get(FAKE_TELEMETRY);
    const { subscribe, state } = nexus.get(ENGINE_ROOM);
    const listener = () => {};
    subscribe(listener);
    expect(feed.listeners).toEqual([listener]);
    feed.show(online(idle));
    expect(state()).toBe(feed.state());
  });

  test('passes Nexus.check with federation()', () => {
    expect(() => Nexus.check(root, { plugins: [federation()] })).not.toThrow();
  });
});
