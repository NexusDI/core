import type { RoomPlan } from './atmosphere';
import { KAPPA } from './constants';
import { pressure, totalMoles, type Air } from './gas';

/**
 * One door of the deck. The deck's `DoorPlan` has this shape, and the
 * simulation's contracts re-export it.
 */
export interface DoorPlan {
  readonly id: string;
  /** Two compartment ids, or one and `space`. */
  readonly between: readonly string[];
  /** Square metres. */
  readonly area: number;
}

/** The pressure interlock: a door opens only while both sides sit within `limit` Pa of each other. */
export const PRESSURE_INTERLOCK = { limit: 5_000 } as const;

/**
 * The shares of each gas an open door of `area` (m²) trades in `dt` seconds
 * between a room of `volumeA` and a room of `volumeB` (m³).
 *
 * With `f = 1 − exp(−dt · A / (κ · (V_a + V_b)))`, side A sends
 * `fromA = f · V_b / V` of its gas and side B sends `fromB = f · V_a / V`.
 * One step shrinks the gap in molar density between the rooms by `1 − f`.
 */
export function doorFractions(
  area: number,
  volumeA: number,
  volumeB: number,
  dt: number,
): { readonly fromA: number; readonly fromB: number } {
  const volume = volumeA + volumeB;
  const f = 1 - Math.exp((-dt * area) / (KAPPA * volume));
  return Object.freeze({
    fromA: (f * volumeB) / volume,
    fromB: (f * volumeA) / volume,
  });
}

/**
 * The true pressure on each side of `door` in Pa, in the order `between`
 * lists them. `space` reads 0 Pa.
 */
export function doorPressures(
  compartments: Readonly<Record<string, Air>>,
  rooms: readonly Pick<RoomPlan, 'id' | 'volume'>[],
  door: DoorPlan,
): readonly [number, number] {
  const side = (id: string | undefined): number => {
    if (id === 'space') return 0;
    const room = rooms.find((candidate) => candidate.id === id);
    const air = id === undefined ? undefined : compartments[id];
    if (!room || !air)
      throw new Error(`The door '${door.id}' names no room '${id}'.`);
    return pressure(totalMoles(air.moles), air.temperature, room.volume);
  };
  return Object.freeze([side(door.between[0]), side(door.between[1])] as const);
}
