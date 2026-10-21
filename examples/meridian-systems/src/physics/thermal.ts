import { SIGMA, T_BACKGROUND } from './constants';

/** The fixed figures of a fusion reactor. */
export interface ReactorRating {
  /** Thermal output at full level, in W. */
  readonly thermal: number;
  /** The share of the thermal output the reactor turns into electricity, 0 to 1. */
  readonly efficiency: number;
  /** The most the level moves toward its setpoint, per second. */
  readonly ramp: number;
}

/** The reactor's state at the end of a tick. */
export interface ReactorRecord {
  /** The output level, 0 to 1. */
  readonly level: number;
  /** Thermal output, in W. */
  readonly thermal: number;
  /** Electric output, in W. */
  readonly electric: number;
  /** True once the coolant loop has tripped the reactor. */
  readonly tripped: boolean;
}

/** The fixed figures of a coolant loop and its radiators. */
export interface CoolantRating {
  /** Coolant mass, in kg. */
  readonly mass: number;
  /** Specific heat capacity of the coolant, in J/(kg K). */
  readonly heatCapacity: number;
  /** Radiator area, in m². */
  readonly area: number;
  /** Radiator emissivity, 0 to 1. */
  readonly emissivity: number;
  /** The temperature the louvres hold the loop at, in K. They open above it. */
  readonly standby: number;
  /** The span above `standby` over which the louvres open fully, in K. */
  readonly band: number;
  /** The temperature the coolant alarm sounds at, in K. */
  readonly alarm: number;
  /** The temperature the loop trips the reactor at, in K. */
  readonly trip: number;
}

/** The coolant loop's state at the end of a tick. */
export interface CoolantRecord {
  /** Coolant temperature, in K. */
  readonly temperature: number;
}

/** The Meridian's reactor, from spec §5.6. */
export const FUSION_REACTOR: ReactorRating = {
  thermal: 3.63e9,
  efficiency: 1 / 3,
  ramp: 0.02,
};

/**
 * The Meridian's 200 t lithium loop, from spec §5.6.
 *
 * The standby temperature of 500 K sits above lithium's melting point of
 * 453.7 K, so the loop never freezes while the louvres are shut.
 */
export const LITHIUM_LOOP: CoolantRating = {
  mass: 200_000,
  heatCapacity: 4_170,
  area: 24_000,
  emissivity: 0.9,
  standby: 500,
  band: 50,
  alarm: 1_350,
  trip: 1_450,
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Moves the reactor level toward `throttle` by at most `ramp · dt` and derives
 * the outputs from the new level: `P_th = level · thermal`, `P_e = η · P_th`.
 * The trip flag passes through unchanged. The caller sets it from `tripped()`.
 */
export function stepReactor(
  reactor: ReactorRecord,
  throttle: number,
  rating: ReactorRating,
  dt: number,
): ReactorRecord {
  const limit = rating.ramp * dt;
  const level = reactor.level + clamp(throttle - reactor.level, -limit, limit);
  const thermal = level * rating.thermal;
  return {
    level,
    thermal,
    electric: rating.efficiency * thermal,
    tripped: reactor.tripped,
  };
}

/**
 * The open fraction of the radiator louvres, `λ = clamp((T_c − standby) / band, 0, 1)`.
 *
 * At or below the standby temperature λ is 0 and the loop radiates nothing,
 * so an idle loop holds its temperature exactly.
 */
export function louvre(temperature: number, rating: CoolantRating): number {
  return clamp((temperature - rating.standby) / rating.band, 0, 1);
}

/**
 * One explicit step of the loop temperature:
 * `T_c' = T_c + dt · (heat − λ · ε · σ · A · (T_c⁴ − T_bg⁴)) / (m · c_p)`.
 *
 * `heat` is every watt that enters the loop this tick: the reactor's
 * `P_th − P_e` plus the load heat. The explicit step stays stable because the
 * loop's shortest time constant, 102 s at 1,186 K, is far above `dt`.
 */
export function stepCoolant(
  coolant: CoolantRecord,
  heat: number,
  rating: CoolantRating,
  dt: number,
): CoolantRecord {
  const t = coolant.temperature;
  const radiated =
    louvre(t, rating) *
    rating.emissivity *
    SIGMA *
    rating.area *
    (t ** 4 - T_BACKGROUND ** 4);
  return {
    temperature:
      t + (dt * (heat - radiated)) / (rating.mass * rating.heatCapacity),
  };
}

/** True when the loop has reached its trip temperature. */
export function tripped(
  coolant: CoolantRecord,
  rating: CoolantRating,
): boolean {
  return coolant.temperature >= rating.trip;
}
