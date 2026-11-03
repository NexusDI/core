import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { SHIP_GEOMETRY } from '@nexusdi/meridian-systems/geometry';

import type {
  ConduitState,
  DeckAlarm,
  DeckEvent,
  DeckPatch,
  DoorState,
  IDeckBinding,
  RoomLight,
} from '../state/contracts.js';
import { DECK_BINDINGS } from '../state/tokens.js';

import type {
  AnswerReadout,
  FrameReadout,
  GraphReadout,
  Readout,
} from './contracts.js';
import {
  alarmedRooms,
  doorIsOpen,
  readingOf,
  shedByAlarm,
  sidePressure,
} from './shared.js';

/** The code of the alarm that closes a door and names the cause. */
const DECOMPRESSION = 'DECOMPRESSION';

const KILO = 1e3;
/** The room the safety callout reads, and the door the airlock callout reads. */
const SAFETY_ROOM = 'habitat';
const AIRLOCK_DOOR = 'airlock-outer';

/** The trace events that run while a provider starts. */
const STARTUP_EVENTS: ReadonlySet<string> = new Set(['construct', 'init']);

const FRAME_READOUTS: readonly FrameReadout[] = [
  {
    name: 'alarm-list',
    label: 'Active alarms',
    source: 'reading',
    read: ({ safety }) =>
      safety.alarms.length === 0
        ? 'none'
        : safety.alarms
            .map(({ code, subject }) => `${code} ${subject}`)
            .join(', '),
  },
  {
    name: 'door-state',
    label: 'Habitat doors open',
    unit: 'open',
    source: 'reading',
    read: (reading) =>
      SHIP_GEOMETRY.doors.filter(
        ({ id, between }) =>
          between.includes(SAFETY_ROOM) && doorIsOpen(reading, id),
      ).length,
  },
  {
    name: 'fire-intensity',
    label: 'Habitat fire intensity',
    unit: '%',
    source: 'reading',
    read: ({ safety }) => (safety.fires[SAFETY_ROOM] ?? 0) * 100,
  },
  {
    name: 'flood-released',
    label: 'Habitat flood released',
    unit: 'mol',
    source: 'reading',
    read: ({ safety }) => safety.flooded[SAFETY_ROOM] ?? 0,
  },
  {
    name: 'pressure-difference',
    label: 'Pressure across the outer door',
    unit: 'kPa',
    source: 'reading',
    read: (reading) => {
      const door = SHIP_GEOMETRY.doors.find(({ id }) => id === AIRLOCK_DOOR);
      const [first, second] = door?.between ?? [];
      if (first === undefined || second === undefined) return null;
      return (
        Math.abs(sidePressure(reading, first) - sidePressure(reading, second)) /
        KILO
      );
    },
  },
];

/**
 * The refusal that stopped the last command, from the `answer` event. An
 * accepted command reads null.
 */
const INTERLOCK_CHAIN: AnswerReadout = {
  name: 'interlock-chain',
  label: 'Interlock chain',
  source: 'answer',
  read: ({ refused }) => refused ?? null,
};

/** The number of modules the graph holds, from the `graph` event. */
const GRAPH_MODULES: GraphReadout = {
  name: 'graph-modules',
  label: 'Modules loaded',
  source: 'graph',
  read: ({ modules }) => modules.length,
};

/**
 * The number of startup steps the providers ran, counted from the trace
 * events of the `graph` event, since the profile reaches the deck as that
 * view.
 */
const STARTUP_STEPS: GraphReadout = {
  name: 'startup-steps',
  label: 'Startup steps',
  source: 'graph',
  read: ({ providers }) =>
    Object.values(providers)
      .flat()
      .filter((trace) => STARTUP_EVENTS.has(trace)).length,
};

const READOUTS: readonly Readout[] = [
  ...FRAME_READOUTS,
  INTERLOCK_CHAIN,
  GRAPH_MODULES,
  STARTUP_STEPS,
];

/**
 * Safety's part of the deck: the alarm list, the light of an alarmed room,
 * every door and the conduit of a shed load. Safety has no hull section, so
 * its rooms and doors span the ship. It also carries the three readouts that
 * need an event instead of a frame: `interlock-chain` reads the latest
 * `answer`, and `graph-modules` and `startup-steps` read the latest `graph`.
 */
export class SafetyDeckBinding implements IDeckBinding {
  readonly readouts = READOUTS;

  patchOf(event: DeckEvent): DeckPatch | undefined {
    const reading = readingOf(event);
    return reading === undefined ? undefined : this.patch(reading);
  }

  private patch(reading: ShipReading): DeckPatch {
    const alarms: DeckAlarm[] = reading.safety.alarms.map(
      ({ code, subject }) => ({ code, subject }),
    );
    const rooms: Record<string, RoomLight> = {};
    for (const room of alarmedRooms(reading)) rooms[room] = 'alarm';
    const decompressing = new Set(
      alarms
        .filter(({ code }) => code === DECOMPRESSION)
        .map(({ subject }) => subject),
    );
    const doors: Record<string, DoorState> = {};
    for (const { id, between } of SHIP_GEOMETRY.doors) {
      doors[id] = doorIsOpen(reading, id)
        ? { state: 'open' }
        : between.some((side) => decompressing.has(side))
          ? { state: 'closed', cause: DECOMPRESSION }
          : { state: 'closed' };
    }
    const shedLoads = shedByAlarm(reading);
    const conduits: Record<string, ConduitState> = {};
    for (const route of SHIP_GEOMETRY.conduits) {
      if (route.load !== undefined && shedLoads.has(route.load)) {
        conduits[route.id] = { state: 'shed', level: 0 };
      }
    }
    return { rooms, alarms, doors, conduits };
  }
}

/** Binds the safety binding to `DECK_BINDINGS`. */
export const SafetyDeck = defineModule({
  name: 'SafetyDeck',
  providers: [provide(DECK_BINDINGS, { useClass: SafetyDeckBinding })],
  exports: [DECK_BINDINGS],
});
