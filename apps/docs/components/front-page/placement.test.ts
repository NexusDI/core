import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { inspect } from '@nexusdi/devtools';
import {
  CONDUITS,
  HATCHES,
  SEED,
  SYSTEMS,
  rootOf,
} from '@nexusdi/meridian/scenes/front-page';
import { describe, expect, it } from 'vitest';

import { PLACEMENT } from './placement';

interface Geometry {
  readonly compartments: readonly {
    readonly id: string;
    readonly fixtures: readonly { readonly id: string }[];
  }[];
  readonly doors: readonly {
    readonly id: string;
    readonly between: readonly [string, string];
  }[];
}

const geometry = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '../../../../examples/meridian-systems/deck/meridian.geometry.json',
    ),
    'utf8',
  ),
) as Geometry;

const rooms = new Set(geometry.compartments.map((each) => each.id));
const fixtures = new Set(
  geometry.compartments.flatMap((each) => each.fixtures.map((f) => f.id)),
);
const doors = new Map(geometry.doors.map((each) => [each.id, each.between]));

const graph = inspect(rootOf(SEED));
const nameOf = (id: string) => graph.modules.find((m) => m.id === id)?.name;

describe('the front-page placement', () => {
  it('names only rooms of the geometry', () => {
    const named = [
      ...Object.values(PLACEMENT.hullSections).flat(),
      ...Object.values(PLACEMENT.conduits).flatMap((r) => r.rooms),
    ];
    expect(named.filter((id) => !rooms.has(id))).toEqual([]);
  });

  it('puts every provider and the readout on a fixture of the geometry', () => {
    const named = [...Object.values(PLACEMENT.providers), PLACEMENT.readout];
    expect(named.filter((id) => !fixtures.has(id))).toEqual([]);
  });

  it('puts every hatch on a door of the geometry', () => {
    const named = Object.values(PLACEMENT.hatches);
    expect(named.filter((id) => !doors.has(id))).toEqual([]);
  });

  it('keeps each provider in a room of its hull section', () => {
    const section = new Map(
      Object.entries(PLACEMENT.hullSections).flatMap(([name, list]) =>
        list.map((room) => [room, name] as const),
      ),
    );
    const providerModule = new Map(
      graph.providers.map((p) => [p.token, nameOf(p.module)]),
    );
    for (const [token, fixture] of Object.entries(PLACEMENT.providers)) {
      const room = fixture.split('.')[0] as string;
      expect([token, section.get(room)]).toEqual([
        token,
        providerModule.get(token),
      ]);
    }
  });

  it('draws each conduit along doors, from the exported provider to the importer', () => {
    for (const [id, route] of Object.entries(PLACEMENT.conduits)) {
      expect([id, route.rooms[0]]).toEqual([id, route.from]);
      expect([id, route.rooms.at(-1)]).toEqual([id, route.to]);
      route.rooms.slice(1).forEach((room, at) => {
        const before = route.rooms[at] as string;
        const joined = [...doors.values()].some(
          ([a, b]) =>
            (a === before && b === room) || (a === room && b === before),
        );
        expect([id, before, room, joined]).toEqual([id, before, room, true]);
      });
    }
  });

  it("anchors a conduit at the room of the imported module's first export", () => {
    const exported = new Map(
      graph.modules.map((m) => [
        m.name,
        graph.providers.find((p) => p.id === m.exports[0])?.token,
      ]),
    );
    for (const [id, route] of Object.entries(PLACEMENT.conduits)) {
      const imported = id.split('>')[1] as string;
      const token = exported.get(imported) as keyof typeof PLACEMENT.providers;
      expect([id, PLACEMENT.providers[token].split('.')[0]]).toEqual([
        id,
        route.from,
      ]);
    }
  });

  it('places every module, provider, export and import of the seed graph', () => {
    const modules = graph.modules.map((m) => m.name).sort();
    expect(Object.keys(PLACEMENT.hullSections).sort()).toEqual(modules);

    const tokens = graph.providers
      .filter((p) => !p.internal)
      .map((p) => p.token)
      .sort();
    expect(
      [
        ...Object.keys(PLACEMENT.providers),
        ...Object.keys(PLACEMENT.unplaced),
      ].sort(),
    ).toEqual(tokens);

    const exports = graph.modules
      .flatMap((m) => m.exports)
      .map((id) => graph.providers.find((p) => p.id === id)?.token)
      .sort();
    expect(Object.keys(PLACEMENT.hatches).sort()).toEqual(exports);

    const imports = graph.modules
      .flatMap((m) => m.imports.map((to) => `${m.name}>${nameOf(to)}`))
      .sort();
    expect(Object.keys(PLACEMENT.conduits).sort()).toEqual(imports);
  });

  it('covers every id of the scene state', () => {
    expect(Object.keys(PLACEMENT.providers).sort()).toEqual(
      [...SYSTEMS].sort(),
    );
    expect(Object.keys(PLACEMENT.hatches).sort()).toEqual([...HATCHES].sort());
    expect(Object.keys(PLACEMENT.conduits).sort()).toEqual(
      [...CONDUITS].sort(),
    );
  });

  it('opens each hatch onto a room of the exporting module', () => {
    const exporter = new Map(
      graph.modules.flatMap((m) =>
        m.exports.map(
          (id) =>
            [graph.providers.find((p) => p.id === id)?.token, m.name] as const,
        ),
      ),
    );
    for (const [token, door] of Object.entries(PLACEMENT.hatches)) {
      const owner = exporter.get(token) as keyof typeof PLACEMENT.hullSections;
      const section = PLACEMENT.hullSections[owner];
      const between = doors.get(door) as readonly string[];
      expect([token, between.some((room) => section.includes(room))]).toEqual([
        token,
        true,
      ]);
    }
  });

  it('puts no room in two hull sections', () => {
    const all = Object.values(PLACEMENT.hullSections).flat();
    expect(all.length).toBe(new Set(all).size);
  });

  it("puts the readout in the root module's section", () => {
    const room = PLACEMENT.readout.split('.')[0] as string;
    expect(PLACEMENT.hullSections.Meridian).toContain(room);
  });
});
