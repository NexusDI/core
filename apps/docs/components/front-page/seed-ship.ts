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
