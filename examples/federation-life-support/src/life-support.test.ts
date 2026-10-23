import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Nexus, defineModule, provide } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import {
  COMMAND_LINK,
  TELEMETRY_FEED,
  type CommandReceipt,
  type ICommandLink,
  type IStationTelemetry,
  type StationCommand,
  type TelemetryReading,
  type TelemetryState,
} from '@nexusdi/federation-contracts';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it } from 'vitest';

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

const sent: StationCommand[] = [];
const feed: IStationTelemetry = {
  subscribe: () => () => {},
  state: () => online(idle),
};
const link: ICommandLink = {
  send: async (command) => {
    sent.push(command);
    return { queued: true, tick: 3, text: 'queued' } satisfies CommandReceipt;
  },
};

/** What the shell's Tactical gives a loaded remote: global feed and link. */
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(TELEMETRY_FEED, { useValue: feed }),
    provide(COMMAND_LINK, { useValue: link }),
  ],
  exports: [TELEMETRY_FEED, COMMAND_LINK],
  global: true,
});

const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, LifeSupportStation],
});

describe('LifeSupportStation', () => {
  it('lists the compartments in reading order', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    const rows = ship.get(ATMOSPHERE_DESK).compartments(online(idle));
    expect(rows?.map((row) => row.id)).toEqual([
      'bridge',
      'habitat',
      'reactor-bay',
      'airlock',
    ]);
  });

  it('reads the habitat air in SI', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    const rows = ship.get(ATMOSPHERE_DESK).compartments(online(idle));
    expect(rows?.find((row) => row.id === 'habitat')?.gauges).toEqual([
      ['Temperature', '293.0 K'],
      ['Pressure', '101.3 kPa'],
      ['O₂ partial pressure', '21.28 kPa'],
      ['CO₂ partial pressure', '0.04 kPa'],
    ]);
  });

  it('has no rows before the first reading', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    expect(ship.get(ATMOSPHERE_DESK).compartments(online(null))).toBeNull();
  });

  it('sends each command to the habitat over the link', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    const desk = ship.get(ATMOSPHERE_DESK);
    sent.length = 0;
    await desk.online();
    await desk.scrubber('habitat', false);
    await desk.oxygen('habitat', true);
    expect(sent).toEqual([
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

  it('returns the receipt the link gives', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    expect(await ship.get(ATMOSPHERE_DESK).online()).toEqual({
      queued: true,
      tick: 3,
      text: 'queued',
    });
  });

  it('passes Nexus.check with federation()', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: [federation()] }),
    ).not.toThrow();
  });
});
