import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { SHIP_GEOMETRY } from '@nexusdi/meridian-systems/geometry';

import type {
  ConduitState,
  DeckEvent,
  DeckPatch,
  IDeckBinding,
} from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type { FrameReadout } from './contracts.js';
import {
  alarmedRooms,
  allocated,
  fixturesOfSections,
  frameAll,
  readingOf,
  shedByAlarm,
} from './shared.js';

/** The hull sections whose rooms and fixtures engineering owns. */
const SECTIONS = ['engineering', 'reactor-bay'] as const;

/** The room where the router sits. */
const ROUTER_ROOM = 'engineering';

/** The coolant loop's range for a conduit's brightness: it starts at 500 K and trips the reactor at 1,450 K. */
const COOLANT_FLOOR = 500;
const COOLANT_TRIP = 1450;
/** The conduit turns to the throttled hue this far under the trip. */
const COOLANT_WARNING = 100;

const MEGAWATT = 1e6;

/** The conduit of a power load runs as full as the router meets the load's demand. */
function powerConduit(demand: number, got: number): ConduitState {
  return {
    state: 'flowing',
    level: demand > 0 ? Math.min(1, got / demand) : 0,
  };
}

function coolantConduit(temperature: number): ConduitState {
  const level = Math.min(
    1,
    Math.max(0, (temperature - COOLANT_FLOOR) / (COOLANT_TRIP - COOLANT_FLOOR)),
  );
  if (temperature >= COOLANT_TRIP) return { state: 'broken', level };
  if (temperature >= COOLANT_TRIP - COOLANT_WARNING)
    return { state: 'shed', level };
  return { state: 'flowing', level };
}

/**
 * The readouts the engineering and reactor bay callouts name. Each reads the
 * reactor, coolant and power records of the frame.
 */
const READOUTS: readonly FrameReadout[] = [
  {
    name: 'reactor-level',
    label: 'Reactor level',
    unit: '%',
    source: 'reading',
    read: ({ reactor }) => reactor.level * 100,
  },
  {
    name: 'electric-output',
    label: 'Electric output',
    unit: 'MW',
    source: 'reading',
    read: ({ reactor }) => reactor.electric / MEGAWATT,
  },
  {
    name: 'coolant-temperature',
    label: 'Coolant temperature',
    unit: 'K',
    source: 'reading',
    read: ({ coolant }) => coolant.temperature,
  },
  {
    name: 'shield-allocation',
    label: 'Shield allocation',
    unit: 'MW',
    source: 'reading',
    read: (reading) => {
      const got = allocated(reading, 'shields');
      return got === undefined ? null : got / MEGAWATT;
    },
  },
];

/**
 * Engineering's part of the deck: the consoles and machinery of the
 * engineering room and the reactor bay, the engineering room's light, and the
 * power and coolant conduits. A power conduit whose load has a `LOAD_SHED`
 * alarm is left to the safety binding, which marks it `shed`.
 */
export class EngineeringDeckBinding implements IDeckBinding {
  readonly readouts = READOUTS;

  private readonly fixtures = fixturesOfSections(SECTIONS);

  patchOf(event: DeckEvent): DeckPatch | undefined {
    const reading = readingOf(event);
    return reading === undefined ? undefined : this.patch(reading);
  }

  private patch(reading: ShipReading): DeckPatch {
    const running = reading.reactor.level > 0 && !reading.reactor.tripped;
    const conduits: Record<string, ConduitState> = {};
    const shed = shedByAlarm(reading);
    for (const route of SHIP_GEOMETRY.conduits) {
      if (route.kind === 'coolant') {
        conduits[route.id] = coolantConduit(reading.coolant.temperature);
      } else if (route.kind === 'power' && route.load !== undefined) {
        const load = reading.power.loads.find(({ id }) => id === route.load);
        if (load !== undefined && !shed.has(load.id)) {
          conduits[route.id] = powerConduit(load.demand, load.allocated);
        }
      }
    }
    return {
      rooms: alarmedRooms(reading).has(ROUTER_ROOM)
        ? {}
        : {
            [ROUTER_ROOM]:
              reading.reactor.electric > 0 ? 'powered' : 'unpowered',
          },
      frames: frameAll(this.fixtures, running ? 'on' : 'off'),
      conduits,
    };
  }
}

/** Binds the engineering binding to `DECK_BINDINGS`. */
export const EngineeringDeck = defineModule({
  name: 'EngineeringDeck',
  providers: [provide(DECK_BINDINGS, { useClass: EngineeringDeckBinding })],
  exports: [DECK_BINDINGS],
});
