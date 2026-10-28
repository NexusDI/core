import { SIGMA, T_BACKGROUND } from '../../physics/constants';
import { byCodeUnit } from '../../simulation/by-code-unit';

import type {
  CoolantRating,
  CoolantRecord,
  LoadRecord,
  PowerLoad,
  PowerRecord,
  ReactorRating,
  ReactorRecord,
} from './contracts';

/** The Meridian's reactor. */
export const FUSION_REACTOR: ReactorRating = {
  thermal: 3.63e9,
  efficiency: 1 / 3,
  ramp: 0.02,
};

/**
 * The Meridian's 200 t lithium loop.
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

/**
 * The Meridian's deflector shield grid while raised. The lowered grid stays
 * on the router with a demand of 0 W.
 */
export const DEFLECTOR_GRID: PowerLoad = {
  id: 'shields',
  priority: 2,
  demand: 200e6,
  heatShare: 0.25,
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
 * loop's time constant stays far above `dt`: 102 s at 1,186 K and 56 s at the
 * 1,450 K trip.
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

/**
 * The loop after a pulse of `energy` J within one tick:
 * `T_c' = T_c + energy / (m · c_p)`.
 */
export function pulseCoolant(
  coolant: CoolantRecord,
  energy: number,
  rating: CoolantRating,
): CoolantRecord {
  return Object.freeze({
    temperature:
      coolant.temperature + energy / (rating.mass * rating.heatCapacity),
  });
}

/** True when the loop has reached its trip temperature. */
export function tripped(
  coolant: CoolantRecord,
  rating: CoolantRating,
): boolean {
  return coolant.temperature >= rating.trip;
}

function byPriorityThenId(a: PowerLoad, b: PowerLoad): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return byCodeUnit(a.id, b.id);
}

/**
 * Shares `output` (W) among `loads` by priority, then by id.
 *
 * A load whose whole demand fits in what remains gets it. A load that does not
 * fit gets 0 and joins `shed`, and the router moves on to the next, so a later
 * and smaller load can still fit. The ids compare with `byCodeUnit`, which
 * orders by UTF-16 code unit on every runtime, so a replay serves the loads in
 * the same order.
 */
export function allocatePower(
  output: number,
  loads: readonly PowerLoad[],
): PowerRecord {
  let remaining = output;
  const records: LoadRecord[] = [];
  const shed: string[] = [];
  for (const load of [...loads].sort(byPriorityThenId)) {
    const fits = load.demand <= remaining;
    const allocated = fits ? load.demand : 0;
    remaining -= allocated;
    records.push({
      id: load.id,
      priority: load.priority,
      demand: load.demand,
      allocated,
    });
    if (!fits) shed.push(load.id);
  }
  return { output, loads: records, shed };
}

/** The heat the allocated loads put into the coolant loop, `Σ heatShare · allocated`, in W. */
export function loadHeat(
  record: PowerRecord,
  loads: readonly PowerLoad[],
): number {
  const shares = new Map(loads.map((load) => [load.id, load.heatShare]));
  return record.loads.reduce(
    (sum, entry) => sum + (shares.get(entry.id) ?? 0) * entry.allocated,
    0,
  );
}
