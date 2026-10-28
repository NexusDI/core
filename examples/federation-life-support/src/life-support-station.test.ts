import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Nexus } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import type {
  TelemetryReading,
  TelemetryState,
} from '@nexusdi/federation-contracts';
import {
  RECORDED_TICK,
  RECORDING_LINK,
  stationRoot,
} from '@nexusdi/federation-contracts/testing';
import { nexusTest } from '@nexusdi/vitest';
import { describe, expect, test as base } from 'vitest';

import {
  ATMOSPHERE_DESK,
  LifeSupportStation,
} from './life-support-station.module';

/** The deck's start pressure, in Pa. The golden holds moles and kelvin only. */
const DECK_PRESSURE = 101300;

const golden = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../meridian-systems/e2e/golden/idle.seed-7.json',
    ),
    'utf8',
  ),
)[0] as {
  compartments: Record<
    string,
    { temperature: number; moles: Record<string, number> }
  >;
};

/** The idle ship at seed 7, with the deck pressure on each compartment. */
const idle: TelemetryReading = {
  tick: 0,
  reactor: { level: 0, electric: 0 },
  coolant: { temperature: 500 },
  power: { loads: [], shed: [] },
  compartments: Object.fromEntries(
    Object.entries(golden.compartments).map(([id, air]) => [
      id,
      { ...air, pressure: DECK_PRESSURE },
    ]),
  ),
};

const online = (reading: TelemetryReading | null): TelemetryState => ({
  status: 'online',
  reading,
});

const root = stationRoot(LifeSupportStation);
const test = nexusTest(base, root);

describe('LifeSupportStation', () => {
  test('lists the compartments in reading order', ({ nexus }) => {
    const rows = nexus.get(ATMOSPHERE_DESK).compartments(online(idle));
    expect(rows?.map((row) => row.id)).toEqual([
      'bridge',
      'habitat',
      'reactor-bay',
      'airlock',
    ]);
  });

  test('reads the habitat air in SI', ({ nexus }) => {
    const rows = nexus.get(ATMOSPHERE_DESK).compartments(online(idle));
    expect(rows?.find((row) => row.id === 'habitat')?.gauges).toEqual([
      ['Temperature', '293.0 K'],
      ['Pressure', '101.3 kPa'],
      ['O₂ partial pressure', '21.28 kPa'],
      ['CO₂ partial pressure', '0.04 kPa'],
    ]);
  });

  test('reads 0.00 kPa partial pressures in an evacuated compartment', ({
    nexus,
  }) => {
    const vacuum: TelemetryReading = {
      ...idle,
      compartments: {
        airlock: { temperature: 3, pressure: 0, moles: { O2: 0, CO2: 0 } },
      },
    };
    const rows = nexus.get(ATMOSPHERE_DESK).compartments(online(vacuum));
    const gauges = rows?.[0]?.gauges.map(([, value]) => value) ?? [];
    expect(gauges).toEqual(['3.0 K', '0.0 kPa', '0.00 kPa', '0.00 kPa']);
  });

  test('has no rows before the first reading', ({ nexus }) => {
    expect(nexus.get(ATMOSPHERE_DESK).compartments(online(null))).toBeNull();
  });

  test('sends each command to the habitat over the link', async ({ nexus }) => {
    const desk = nexus.get(ATMOSPHERE_DESK);
    await desk.online();
    await desk.scrubber('habitat', false);
    await desk.oxygen('habitat', true);
    expect(nexus.get(RECORDING_LINK).sent).toEqual([
      { system: 'life-support', action: 'online' },
      {
        system: 'life-support',
        action: 'scrubber',
        compartment: 'habitat',
        on: false,
      },
      {
        system: 'life-support',
        action: 'oxygen',
        compartment: 'habitat',
        on: true,
      },
    ]);
  });

  test('starts each test with no command sent', ({ nexus }) => {
    expect(nexus.get(RECORDING_LINK).sent).toEqual([]);
  });

  test('returns the receipt the link gives', async ({ nexus }) => {
    expect(await nexus.get(ATMOSPHERE_DESK).online()).toEqual({
      queued: true,
      tick: RECORDED_TICK,
      text: 'queued',
    });
  });

  test('passes Nexus.check with federation()', () => {
    expect(() => Nexus.check(root, { plugins: [federation()] })).not.toThrow();
  });
});
