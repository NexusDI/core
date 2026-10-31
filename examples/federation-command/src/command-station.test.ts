import { Nexus, defineModule, isNexusError, provide } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import { NAV_CHARTS } from '@nexusdi/federation-contracts';
import type { TelemetryReading } from '@nexusdi/federation-contracts';
import {
  FAKE_HEADING,
  FAKE_TELEMETRY,
  FixedNavCharts,
  RECORDED_TICK,
  RECORDING_LINK,
  FakeShell,
  stationLoad,
  STATION_IMPORTS,
} from '@nexusdi/federation-contracts/testing';
import { nexusTest } from '@nexusdi/vitest';
import { describe, expect, test as base } from 'vitest';

import {
  BURN_BOARD,
  COURSE_PLOTTER,
  CommandStation,
  CoursePlotter,
  HELM_ORDERS,
  HelmOrders,
  REACTOR_ORDERS,
  ReactorOrders,
} from './command-station.module';

/** A fresh shell per test with CommandStation loaded with the station imports, as the shell loads it. */
const test = nexusTest(base, FakeShell).extend<{ station: Nexus }>({
  station: async ({ nexus }, serve) => {
    await nexus.load(CommandStation, STATION_IMPORTS);
    await serve(nexus);
  },
});

/** The error `fn` throws. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

describe('CommandStation', () => {
  test('builds CoursePlotter, whose @Inject accessor reads the contract charts', ({
    station: nexus,
  }) => {
    const plotter = nexus.get(COURSE_PLOTTER);
    expect(plotter).toBeInstanceOf(CoursePlotter);
    expect(plotter.course('Kepler-442b')).toBe(
      `course to Kepler-442b, heading ${FAKE_HEADING}`,
    );
  });

  test('passes Nexus.check with federation()', () => {
    expect(() =>
      Nexus.check(FakeShell, {
        plugins: [federation()],
        load: [stationLoad(CommandStation)],
      }),
    ).not.toThrow();
  });

  test('builds HelmOrders through @Injectable and sends helm orders over COMMAND_LINK', async ({
    station: nexus,
  }) => {
    const helm = nexus.get(HELM_ORDERS);
    expect(helm).toBeInstanceOf(HelmOrders);
    expect(await helm.course('Kepler-442b')).toEqual({
      queued: true,
      tick: RECORDED_TICK,
      text: 'queued',
    });
    await helm.burn(0.5);
    expect(nexus.get(RECORDING_LINK).sent).toEqual([
      { system: 'helm', action: 'course', to: 'Kepler-442b' },
      { system: 'helm', action: 'burn', level: 0.5 },
    ]);
  });

  test('builds ReactorOrders through @Injectable and sends engineering throttle over COMMAND_LINK', async ({
    station: nexus,
  }) => {
    const reactor = nexus.get(REACTOR_ORDERS);
    expect(reactor).toBeInstanceOf(ReactorOrders);
    expect(await reactor.throttle(1)).toEqual({
      queued: true,
      tick: RECORDED_TICK,
      text: 'queued',
    });
    expect(nexus.get(RECORDING_LINK).sent).toEqual([
      { system: 'engineering', action: 'throttle', level: 1 },
    ]);
  });

  test('shows the burn the router served, from the telemetry', ({
    station: nexus,
  }) => {
    const board = nexus.get(BURN_BOARD);
    const feed = nexus.get(FAKE_TELEMETRY);
    expect(board.served(feed.state())).toBeNull();
    const reading = (
      loads: TelemetryReading['power']['loads'],
      shed: readonly string[],
    ): TelemetryReading => ({
      tick: 9,
      reactor: { level: 0.5, electric: 0 },
      coolant: { temperature: 500 },
      power: { loads, shed },
      compartments: {},
    });
    feed.show({
      status: 'online',
      reading: reading([{ id: 'main-drive', allocated: 1_234_500_000 }], []),
    });
    expect(board.served(feed.state())).toBe('1,234.5 MW');
    feed.show({
      status: 'online',
      reading: reading([{ id: 'main-drive', allocated: 0 }], ['main-drive']),
    });
    expect(board.served(feed.state())).toBe('shed');
  });

  test('reads 0.0 MW when the reading lists no main-drive load and sheds nothing', ({
    station: nexus,
  }) => {
    const board = nexus.get(BURN_BOARD);
    const feed = nexus.get(FAKE_TELEMETRY);
    feed.show({
      status: 'online',
      reading: {
        tick: 9,
        reactor: { level: 0.5, electric: 0 },
        coolant: { temperature: 500 },
        power: { loads: [{ id: 'shields', allocated: 5e6 }], shed: [] },
        compartments: {},
      },
    });
    expect(board.served(feed.state())).toBe('0.0 MW');
  });

  test('says the telemetry is offline after the stream drops, with or without a last reading', ({
    station: nexus,
  }) => {
    const board = nexus.get(BURN_BOARD);
    const feed = nexus.get(FAKE_TELEMETRY);
    feed.show({ status: 'offline', reading: null });
    expect(board.served(feed.state())).toBe('telemetry offline');
    feed.show({
      status: 'offline',
      reading: {
        tick: 9,
        reactor: { level: 0.5, electric: 0 },
        coolant: { temperature: 500 },
        power: {
          loads: [{ id: 'main-drive', allocated: 1_234_500_000 }],
          shed: [],
        },
        compartments: {},
      },
    });
    expect(board.served(feed.state())).toBe('telemetry offline');
  });

  test('fails Nexus.check with NEXUS_MISSING_PROVIDER when no COMMAND_LINK or STATION_TELEMETRY is provided', () => {
    const ChartsOnly = defineModule({
      name: 'Tactical',
      providers: [provide(NAV_CHARTS, { useClass: FixedNavCharts })],
      exports: [NAV_CHARTS],
    });
    const withoutLink = defineModule({
      name: 'Meridian',
      imports: [ChartsOnly],
    });
    const error = caught(() =>
      Nexus.check(withoutLink, {
        plugins: [federation()],
        load: [{ module: CommandStation, imports: [ChartsOnly] }],
      }),
    );
    if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID'))
      throw new Error('Expected NEXUS_BLUEPRINT_INVALID.');
    // HelmOrders and ReactorOrders miss the link, and BurnBoard misses the feed.
    expect(error.errors).toHaveLength(3);
    for (const missing of error.errors)
      expect(isNexusError(missing, 'NEXUS_MISSING_PROVIDER')).toBe(true);
    const text = error.errors.map(String).join('\n');
    expect(text).toContain('meridian/CommandLink');
    expect(text).toContain('meridian/StationTelemetry');
  });
});
