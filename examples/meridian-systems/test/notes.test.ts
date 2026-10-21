import { defineModule } from '@nexusdi/core';
import { inspect, type NexusGraph } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { shipNotes } from '../src/notes';
import { Simulation } from '../src/simulation/simulation.module';
import { ShipUnderTest } from './ship-under-test';

/** One provider of the root's own, which the walk must leave unlabelled. */
class Helm {}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [Helm],
  exports: [Helm],
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
      imports: [meridianSystems({ seed: 7, dt: 0.5 }), Bridge],
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
    expect(byModule.ProbeSystems.length).toBeGreaterThan(0);
    for (const notes of byModule.ProbeSystems) {
      expect(notes).toEqual(['system: ProbeSystems']);
    }
  });

  it('gives no note to a root without TICK_LOOP', () => {
    const Root = defineModule({
      name: 'Root',
      imports: [Simulation.forRoot({ seed: 7, dt: 0.5 }), Bridge],
    });
    const graph = inspect(Root, { annotate: [shipNotes] });
    expect(graph.providers.flatMap((provider) => provider.notes)).toEqual([]);
  });
});
