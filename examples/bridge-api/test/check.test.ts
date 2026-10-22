import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { devtools, graph, inspect } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import drawn from '../graph.json';
import { MISSION } from '../src/ship/contracts';
import {
  Meridian,
  OfflineMeridian,
  offlineMeridian,
} from '../src/ship/meridian';
import { bridgePlugins, graphPlugins } from '../src/ship/plugins';

describe('the bridge API graph', () => {
  it('compiles with no user code (the startup check of spec 9.2)', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
    expect(() =>
      Nexus.check(OfflineMeridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
    expect(() =>
      Nexus.check(
        offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
        { plugins: bridgePlugins() },
      ),
    ).not.toThrow();
  });

  it('matches graph.json, the graph the CLI draws', () => {
    // nexusdi graph makes the same inspect() call and writes it with
    // JSON.stringify, which drops undefined fields.
    const live = JSON.parse(
      JSON.stringify(inspect(Meridian, { plugins: graphPlugins })),
    );
    expect(
      live,
      'run nx run @nexusdi/bridge-api:graph and commit graph.json',
    ).toEqual(drawn);
  });

  it('names the audit module AuditTrail, in the container and in graph.json', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: [...bridgePlugins(), devtools()],
    });
    const names = graph(ship).modules.map((m) => m.name);
    expect(names).toContain('AuditTrail');
    expect(names).not.toContain('Audit');
    const drawnNames = drawn.modules.map((m) => m.name);
    expect(drawnNames).toContain('AuditTrail');
    expect(drawnNames).not.toContain('Audit');
  });

  it('labels the ship providers with their system in the development graph', async () => {
    await using ship = await Nexus.create(offlineMeridian(), {
      plugins: bridgePlugins({ dev: true }),
    });
    const { modules, providers } = graph(ship);
    // ShipSystems and CommandHandlers have a provider in each system module,
    // so a note is keyed by token and module.
    const moduleName = new Map(modules.map((m) => [m.id, m.name]));
    const notes = Object.fromEntries(
      providers.map((p) => [
        `${p.token} in ${moduleName.get(p.module)}`,
        p.notes,
      ]),
    );
    expect(notes['TickLoop in MeridianSystems']).toEqual([
      'system: MeridianSystems',
    ]);
    expect(notes['ShipState in Simulation']).toEqual(['system: Simulation']);
    expect(notes['TelemetryFeed in Telemetry']).toEqual(['system: Telemetry']);
    expect(notes['ShipSystems in Engineering']).toEqual([
      'system: Engineering',
      'phase: 1',
    ]);
    expect(notes['ShipSystems in LifeSupport']).toEqual([
      'system: LifeSupport',
      'phase: 4',
    ]);
    expect(notes['CommandHandlers in Engineering']).toEqual([
      'system: Engineering',
    ]);
    expect(notes['CommandHandlers in LifeSupport']).toEqual([
      'system: LifeSupport',
    ]);
    expect(notes['PowerConsumers in LifeSupport']).toEqual([
      'system: LifeSupport',
    ]);
    expect(notes['AtmosphereProbe in LifeSupport']).toEqual([
      'system: LifeSupport',
    ]);
    expect(notes['ShipSystems in Safety']).toEqual([
      'system: Safety',
      'phase: 5',
    ]);
    for (const token of [
      'CommandHandlers',
      'BlastDoors',
      'FireSuppression',
      'MasterAlarm',
    ]) {
      expect(notes[`${token} in Safety`]).toEqual(['system: Safety']);
    }

    // The bridge registers the interlock and the flight recorder in its
    // interceptors plugin, outside every ship system.
    for (const token of [
      'FlightRecorder',
      'PressureInterlock',
      'RequestScopes',
    ])
      expect(notes[`${token} in interceptors`]).toEqual([]);

    const bridgeModules = [
      'BridgeApi',
      'AuditTrail',
      'OfflineTactical',
      'SimDriver',
    ];
    const ids = modules
      .filter((m) => bridgeModules.includes(m.name))
      .map((m) => m.id);
    expect(ids).toHaveLength(bridgeModules.length);
    const bridgeProviders = providers.filter((p) => ids.includes(p.module));
    expect(bridgeProviders.length).toBeGreaterThan(0);
    for (const provider of bridgeProviders) expect(provider.notes).toEqual([]);
  });

  it('fails the check when a provider has no MISSION to read', () => {
    const TRACKER = new Token<{ id: string }>('Tracker');
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(TRACKER, {
          useFactory: (m) => m,
          deps: [MISSION],
          lifetime: 'scoped',
        }),
      ],
    });
    let thrown: unknown;
    try {
      Nexus.check(Broken);
    } catch (error) {
      thrown = error;
    }
    expect(isNexusError(thrown, 'NEXUS_BLUEPRINT_INVALID')).toBe(true);
  });
});
