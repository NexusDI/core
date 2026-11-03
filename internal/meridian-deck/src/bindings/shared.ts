import type { RoomAlarmCode, ShipReading } from '@nexusdi/meridian-systems';
import { SHIP_GEOMETRY } from '@nexusdi/meridian-systems/geometry';

import type {} from '../maps/events.js';
import type { DeckEvent, PropFrame } from '../state/contracts.js';

/** The frame of a reading event, or undefined for any other event. */
export function readingOf(event: DeckEvent): ShipReading | undefined {
  return event.type === 'reading' ? event.reading : undefined;
}

/** The allocation of one power load, or undefined when the router has no such load. */
export function allocated(
  reading: ShipReading,
  load: string,
): number | undefined {
  return reading.power.loads.find(({ id }) => id === load)?.allocated;
}

/** The fixtures of the compartments in the hull sections, with their ids. */
export function fixturesOfSections(sections: readonly string[]): string[] {
  return SHIP_GEOMETRY.compartments
    .filter(({ hullSection }) => sections.includes(hullSection))
    .flatMap(({ fixtures }) => fixtures)
    .filter(({ states }) => states.includes('on') && states.includes('off'))
    .map(({ id }) => id);
}

/** A record that gives every id the same frame. */
export function frameAll(
  ids: readonly string[],
  frame: PropFrame,
): Record<string, PropFrame> {
  return Object.fromEntries(ids.map((id) => [id, frame]));
}

/**
 * The alarm codes that light the room they name. Other codes name a load or
 * the reactor, and a code this build does not list lights nothing.
 */
const ROOM_ALARM_CODES = {
  FIRE: true,
  SENSOR_FAULT: true,
  HYPOXIA: true,
  CO2_HIGH: true,
  PRESSURE_LOW: true,
  TEMPERATURE: true,
  DECOMPRESSION: true,
} satisfies Record<RoomAlarmCode, true>;

/** The compartments whose alarm lights them. */
export function alarmedRooms(reading: ShipReading): ReadonlySet<string> {
  const rooms = new Set(SHIP_GEOMETRY.compartments.map(({ id }) => id));
  return new Set(
    reading.safety.alarms
      .filter(
        ({ code, subject }) =>
          Object.hasOwn(ROOM_ALARM_CODES, code) && rooms.has(subject),
      )
      .map(({ subject }) => subject),
  );
}

/** The pressure on one side of a door in pascals: space is a vacuum. */
export function sidePressure(reading: ShipReading, side: string): number {
  const room = (
    reading.compartments as Readonly<Record<string, { pressure: number }>>
  )[side];
  return room?.pressure ?? 0;
}

/** True while the crew holds a door open. The setpoints key their doors by the library's door ids, and the geometry names them as strings. */
export function doorIsOpen(reading: ShipReading, door: string): boolean {
  const doors: Readonly<Record<string, boolean>> =
    reading.setpoints.safety.doors;
  return doors[door] ?? false;
}

/** The loads the safety binding marks `shed`: the subjects of the `LOAD_SHED` alarms. */
export function shedByAlarm(reading: ShipReading): ReadonlySet<string> {
  return new Set(
    reading.safety.alarms
      .filter(({ code }) => code === 'LOAD_SHED')
      .map(({ subject }) => subject),
  );
}
