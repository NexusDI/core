import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { SHIP_GEOMETRY } from '@nexusdi/meridian-systems/geometry';

import type {
  ConduitState,
  DeckEvent,
  DeckPatch,
  IDeckBinding,
  RoomLight,
} from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type { FrameReadout } from './contracts.js';
import { alarmedRooms, allocated, readingOf } from './shared.js';

/** Engineering lights its own room from the reactor's output. */
const ENGINEERING_ROOM = 'engineering';

const KILO = 1e3;

/** The share of a room's pressure that oxygen holds, from the moles of the room. */
function oxygenShare(reading: ShipReading, room: 'habitat'): number {
  const { moles } = reading.compartments[room];
  const total = Object.values(moles).reduce((sum, n) => sum + n, 0);
  return total > 0 ? moles.O2 / total : 0;
}

/**
 * The readouts the habitat and airlock callouts name, read from the
 * compartments, the heaters and the pumps of the frame.
 */
const READOUTS: readonly FrameReadout[] = [
  {
    name: 'habitat-temperature',
    label: 'Habitat temperature',
    unit: 'K',
    source: 'reading',
    read: ({ compartments }) => compartments.habitat.temperature,
  },
  {
    name: 'habitat-pressure',
    label: 'Habitat pressure',
    unit: 'kPa',
    source: 'reading',
    read: ({ compartments }) => compartments.habitat.pressure / KILO,
  },
  {
    name: 'oxygen-partial-pressure',
    label: 'Oxygen partial pressure',
    unit: 'kPa',
    source: 'reading',
    read: (reading) =>
      (reading.compartments.habitat.pressure *
        oxygenShare(reading, 'habitat')) /
      KILO,
  },
  {
    name: 'heater-power',
    label: 'Habitat heater power',
    unit: 'kW',
    source: 'reading',
    read: ({ lifeSupport }) => (lifeSupport.heaters['habitat'] ?? 0) / KILO,
  },
  {
    name: 'airlock-pressure',
    label: 'Airlock pressure',
    unit: 'kPa',
    source: 'reading',
    read: ({ compartments }) => compartments.airlock.pressure / KILO,
  },
  {
    name: 'pump-mode',
    label: 'Airlock pump',
    source: 'reading',
    read: ({ setpoints }) => setpoints.lifeSupport.pumps['airlock'] ?? 'off',
  },
];

/**
 * Life support's part of the deck: the light of every room but engineering,
 * and the atmosphere conduits. A pressurised room is `powered` while the
 * life-support load has an allocation above zero. The two bays hold vacuum
 * and carry no lighting load, so they stay `unpowered` and show only their
 * emissive parts. A room an alarm lights is left to the safety binding.
 */
export class LifeSupportDeckBinding implements IDeckBinding {
  readonly readouts = READOUTS;

  patchOf(event: DeckEvent): DeckPatch | undefined {
    const reading = readingOf(event);
    return reading === undefined ? undefined : this.patch(reading);
  }

  private patch(reading: ShipReading): DeckPatch {
    const lit = (allocated(reading, 'life-support') ?? 0) > 0;
    const alarmed = alarmedRooms(reading);
    const rooms: Record<string, RoomLight> = {};
    for (const { id, pressurised } of SHIP_GEOMETRY.compartments) {
      if (id === ENGINEERING_ROOM || alarmed.has(id)) continue;
      rooms[id] = pressurised && lit ? 'powered' : 'unpowered';
    }
    const { pumps, vents } = reading.setpoints.lifeSupport;
    const pumping = Object.values(pumps).some((mode) => mode !== 'off');
    const venting = Object.values(vents).some(Boolean);
    const conduits: Record<string, ConduitState> = {};
    for (const route of SHIP_GEOMETRY.conduits) {
      if (route.kind !== 'atmosphere') continue;
      const moving = route.id.endsWith('.vent') ? venting : pumping;
      conduits[route.id] = { state: 'flowing', level: moving ? 1 : 0 };
    }
    return { rooms, conduits };
  }
}

/** Binds the life-support binding to `DECK_BINDINGS`. */
export const LifeSupportDeck = defineModule({
  name: 'LifeSupportDeck',
  providers: [provide(DECK_BINDINGS, { useClass: LifeSupportDeckBinding })],
  exports: [DECK_BINDINGS],
});
