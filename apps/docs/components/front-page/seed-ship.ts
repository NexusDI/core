import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DoorState, FixtureState, RoomState } from '@nexusdi/meridian-ui';

import { workspaceRoot } from './facts';
import { PLACEMENT } from './placement';

/**
 * The seed ship as the painted cutaway shows it before any script runs (site
 * UX spec 4.4): the markup of the vector cutaway, and the state of each room
 * and fixture. Core built every provider of the seed, so the rooms of every
 * hull section that holds a module, and the fixture of every provider and of
 * the bridge readout, are powered. The other rooms of the ship are not part of
 * the program and sit under the scrim of an unpowered room.
 */

const SCHEMATIC = [
  'apps',
  'docs',
  'components',
  'front-page',
  'meridian-schematic.svg',
];

const GEOMETRY = [
  'examples',
  'meridian-systems',
  'deck',
  'meridian.geometry.json',
];

interface Box {
  x: [number, number];
  z: [number, number];
}

interface Geometry {
  compartments: { id: string; fixtures: ({ id: string } & Box)[] }[];
}

/**
 * The centre of the fixtures `ids` in the side view, in metres: x along the
 * hull and z up. The ship systems strip anchors its crops and leader lines
 * here, so no position is typed by hand.
 */
export function fixtureCentre(ids: readonly string[]): [number, number] {
  const geometry = JSON.parse(
    readFileSync(join(workspaceRoot(), ...GEOMETRY), 'utf8'),
  ) as Geometry;
  const fixtures = geometry.compartments.flatMap((room) => room.fixtures);
  const boxes = ids.map((id) => {
    const found = fixtures.find((each) => each.id === id);
    if (!found) throw new Error(`The geometry has no fixture ${id}.`);
    return found;
  });
  const span = (axis: 'x' | 'z') => [
    Math.min(...boxes.map((box) => box[axis][0])),
    Math.max(...boxes.map((box) => box[axis][1])),
  ];
  const [x0, x1] = span('x');
  const [z0, z1] = span('z');
  return [((x0 ?? 0) + (x1 ?? 0)) / 2, ((z0 ?? 0) + (z1 ?? 0)) / 2];
}

let markup: string | undefined;

/** The cutaway's SVG markup, read from the committed file. */
export function schematicMarkup(): string {
  markup ??= readFileSync(join(workspaceRoot(), ...SCHEMATIC), 'utf8');
  return markup;
}

/** Every `data-room` id of the cutaway. */
function roomIds(): string[] {
  return [
    ...new Set(
      [...schematicMarkup().matchAll(/data-room="([^"]+)"/g)].map(
        (match) => match[1] ?? '',
      ),
    ),
  ];
}

export interface ShipStates {
  rooms: Record<string, RoomState>;
  fixtures: Record<string, FixtureState>;
  doors: Record<string, DoorState>;
}

/** The lit seed: the hull sections of the program powered, every other room dim. */
export function seedStates(): ShipStates {
  const lit = new Set(Object.values(PLACEMENT.hullSections).flat());
  return {
    rooms: Object.fromEntries(
      roomIds().map((id) => [id, lit.has(id) ? 'powered' : 'unpowered']),
    ),
    fixtures: Object.fromEntries(
      [...Object.values(PLACEMENT.providers), PLACEMENT.readout].map((id) => [
        id,
        'powered' as const,
      ]),
    ),
    doors: {},
  };
}
