import { defineModule, NEXUS_PLUGIN_API, provide, Token } from '@nexusdi/core';
import { inspect, type NexusGraph } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { shipNotes } from '../src/notes';
import {
  type IShipSystem,
  SHIP_SYSTEMS,
  type ShipSnapshot,
} from '../src/simulation/contracts';
import { Simulation } from '../src/simulation/simulation.module';
import { FTL_DRIVE } from '../src/systems/ftl/contracts';
import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';

import { ProbeSystems, shipUnderTest } from './ship-under-test';
import { FailingFtlDrive, SHIP_OPTIONS } from './support';

const ShipUnderTest = shipUnderTest(ProbeSystems);

interface IHelm {
  readonly heading: number;
}

const HELM = new Token<IHelm>('Helm');

/** One provider beside the ship, which the walk must leave unlabelled. */
class FakeHelm implements IHelm {
  readonly heading = 0;
}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [provide(HELM, { useClass: FakeHelm })],
  exports: [HELM],
});

/** Each module's name with the notes of its providers. */
function notesByModule(graph: NexusGraph): Record<string, string[][]> {
  const names = new Map(graph.modules.map((m) => [m.id, m.name]));
  const byModule: Record<string, string[][]> = {};
  for (const provider of graph.providers) {
    const name = names.get(provider.module) ?? provider.module;
    (byModule[name] ??= []).push(provider.notes);
  }
  return byModule;
}

describe('shipNotes', () => {
  it('labels each provider under the module that binds TICK_LOOP with its system', () => {
    const Root = defineModule({
      name: 'Root',
      imports: [meridianSystems(SHIP_OPTIONS), Bridge],
    });
    const byModule = notesByModule(inspect(Root, { annotate: [shipNotes] }));
    for (const name of ['MeridianSystems', 'Simulation', 'Telemetry']) {
      expect(byModule[name].length).toBeGreaterThan(0);
      for (const notes of byModule[name]) {
        expect(notes).toEqual([`system: ${name}`]);
      }
    }
    expect(byModule.Bridge).toEqual([[]]);
    for (const notes of byModule.Root ?? []) expect(notes).toEqual([]);
  });

  it('labels the probe systems that ShipUnderTest imports', () => {
    const byModule = notesByModule(
      inspect(ShipUnderTest, { annotate: [shipNotes] }),
    );
    for (const name of ['ShipUnderTest', 'ProbeSystems']) {
      expect(byModule[name].length).toBeGreaterThan(0);
      for (const notes of byModule[name]) {
        expect(notes).toEqual([`system: ${name}`]);
      }
    }
  });

  it('labels the engineering ship system with its phase and the reactor without one', () => {
    const graph = inspect(meridianSystems(SHIP_OPTIONS), {
      annotate: [shipNotes],
    });
    const notesOf = (implementation: string) =>
      graph.providers.find(
        (provider) => provider.implementation === implementation,
      )?.notes;
    expect(notesOf('EngineeringPhysics')).toEqual([
      'system: Engineering',
      'phase: 1',
    ]);
    expect(notesOf('FusionReactor')).toEqual(['system: Engineering']);
  });

  it('gives no phase note to a ship system class without a static phase', () => {
    const byModule = notesByModule(
      inspect(ShipUnderTest, { annotate: [shipNotes] }),
    );
    expect(byModule.ProbeSystems.flat()).not.toContainEqual(
      expect.stringMatching(/^phase: /),
    );
  });

  it.each([
    ['a phase of 3', 3, ['system: Phased', 'phase: 3']],
    ['a phase of 7', 7, ['system: Phased']],
    ['a phase of 1.5', 1.5, ['system: Phased']],
  ])('labels a ship system class with %s', (_name, phase, notes) => {
    /** A ship system whose class declares `phase`, which only 1 to 6 may. */
    class Stepper implements IShipSystem {
      static readonly phase: number = phase;
      readonly name = 'Stepper';
      readonly phase = 1;
      step(ship: ShipSnapshot): ShipSnapshot {
        return ship;
      }
    }
    const Phased = defineModule({
      name: 'Phased',
      providers: [provide(SHIP_SYSTEMS, { useClass: Stepper })],
      exports: [SHIP_SYSTEMS],
    });
    const graph = inspect(shipUnderTest(Phased), { annotate: [shipNotes] });
    expect(
      graph.providers.find((p) => p.implementation === 'Stepper')?.notes,
    ).toEqual(notes);
  });

  it('labels the loaded FTL drive, and a module that stands in for it, with no phase note', () => {
    const notesOf = (graph: NexusGraph, implementation: string) =>
      graph.providers.find(
        (provider) => provider.implementation === implementation,
      )?.notes;
    // Under a root, so FtlDrive sits outside the walk from TICK_LOOP's module.
    const ship = defineModule({
      name: 'Root',
      imports: [meridianSystems(SHIP_OPTIONS)],
    });
    const loaded = inspect(ship, { load: [FtlDrive], annotate: [shipNotes] });
    expect(notesOf(loaded, 'JumpDrive')).toEqual(['system: FtlDrive']);

    const StandIn = defineModule({
      name: 'StandIn',
      providers: [provide(FTL_DRIVE, { useClass: FailingFtlDrive })],
      exports: [FTL_DRIVE],
    });
    const replaced = inspect(ship, {
      load: [FtlDrive],
      annotate: [shipNotes],
      plugins: [
        {
          name: 'stand-in',
          apiVersion: NEXUS_PLUGIN_API,
          compile: { module: (m) => (m === FtlDrive ? StandIn : undefined) },
        },
      ],
    });
    expect(notesOf(replaced, 'FailingFtlDrive')).toEqual(['system: StandIn']);
  });

  it('gives no note to a root without TICK_LOOP', () => {
    const Root = defineModule({
      name: 'Root',
      imports: [Simulation.forRoot(SHIP_OPTIONS), Bridge],
    });
    const graph = inspect(Root, { annotate: [shipNotes] });
    expect(graph.providers.flatMap((provider) => provider.notes)).toEqual([]);
  });
});
