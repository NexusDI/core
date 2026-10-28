import type { RoomPlan } from './atmosphere';
import { heatCapacity, pressure, totalMoles, type Air, type Gas } from './gas';

/** The constants of the fire law. */
export const FIRE = {
  /** K. A room lights by chance only above this temperature. */
  ignition: 330,
  /** Ignitions per second in an eligible room. */
  lambda: 1e-3,
  /** Intensity gained per second while the room can burn. */
  growth: 0.05,
  /** Decay rate per second while the room cannot burn. */
  decay: 0.2,
  /** A fire below this intensity goes out. */
  out: 0.01,
  /** The intensity of a fire that just lit. */
  start: 0.05,
  /** mol/s at intensity 1: the O₂ a fire burns and the CO₂ and H₂O it adds. */
  burn: { O2: 0.5, CO2: 0.4, H2O: 0.2 },
  /** J per mol of O₂ burned. */
  energy: 400_000,
  /** A room burns only above both limits: the O₂ mole fraction and `p_O₂` in Pa. */
  oxygen: { fraction: 0.16, partial: 16_000 },
} as const;

/** A flood releases a room's whole charge over `seconds`. */
export const FLOOD = { seconds: 10 } as const;

/** The flood charge a compartment of the deck may carry. */
export interface FloodPlan {
  /** Moles of N₂ one flood releases. */
  readonly floodCharge?: number;
}

/**
 * Whether a room of `volume` (m³) holds the oxygen a fire needs: an O₂ mole
 * fraction above 16 % and `p_O₂` above 16 kPa. The fraction catches dilution
 * by inert gas, and the partial pressure catches a room vented to space.
 */
export function burns(air: Air, volume: number): boolean {
  return (
    air.moles.O2 / totalMoles(air.moles) > FIRE.oxygen.fraction &&
    pressure(air.moles.O2, air.temperature, volume) > FIRE.oxygen.partial
  );
}

/**
 * One room's fire over `dt` seconds, from its `intensity` φ (0 for no fire).
 *
 * A room with no fire lights at φ = 0.05 when `burns` holds and either
 * `drill` is set or the room is above 330 K and one `draw` falls under
 * `1 − exp(−λ · dt)`. Any other room with no fire calls no `draw` and keeps
 * its air. A burning room grows `φ' = min(1, φ + 0.05 · dt)` while `burns`
 * holds, else decays to `φ' = φ · exp(−0.2 · dt)`, and goes out under 0.01.
 * The fire burns `min(n_O₂, 0.5 · φ' · dt)` mol of O₂, adds CO₂ and H₂O at
 * 0.4 and 0.2 per 0.5 burned, and heats the room by `400 kJ` per mol burned
 * over the heat capacity of the air before the burn.
 */
export function stepFire(
  air: Air,
  room: Pick<RoomPlan, 'volume' | 'structureHeatCapacity'>,
  intensity: number,
  dt: number,
  draw: () => number,
  drill: boolean,
): { readonly air: Air; readonly intensity: number } {
  const fuel = burns(air, room.volume);
  let next: number;
  if (intensity === 0) {
    if (!fuel) return Object.freeze({ air, intensity: 0 });
    if (!drill) {
      if (air.temperature <= FIRE.ignition) {
        return Object.freeze({ air, intensity: 0 });
      }
      if (draw() >= 1 - Math.exp(-FIRE.lambda * dt)) {
        return Object.freeze({ air, intensity: 0 });
      }
    }
    next = FIRE.start;
  } else {
    next = fuel
      ? Math.min(1, intensity + FIRE.growth * dt)
      : intensity * Math.exp(-FIRE.decay * dt);
    if (next < FIRE.out) return Object.freeze({ air, intensity: 0 });
  }
  const demand = FIRE.burn.O2 * next * dt;
  const burned = Math.min(air.moles.O2, demand);
  const share = burned / demand;
  const moles: Record<Gas, number> = {
    ...air.moles,
    O2: air.moles.O2 - burned,
    CO2: air.moles.CO2 + FIRE.burn.CO2 * next * dt * share,
    H2O: air.moles.H2O + FIRE.burn.H2O * next * dt * share,
  };
  const capacity = heatCapacity(air, room.structureHeatCapacity);
  return Object.freeze({
    air: Object.freeze({
      moles: Object.freeze(moles),
      temperature: air.temperature + (FIRE.energy * burned) / capacity,
    }),
    intensity: next,
  });
}
