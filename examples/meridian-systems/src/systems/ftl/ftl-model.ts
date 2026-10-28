import type {
  CoolantRecord,
  PowerLoad,
  ReactorRecord,
} from '../engineering/contracts';

import type {
  FtlRating,
  FtlRecord,
  FtlSetpoints,
  FtlStatus,
} from './contracts';

/** The Meridian's jump drive. */
export const FTL_SPOOL: FtlRating = {
  energy: 90e9,
  power: 900e6,
  pulseShare: 0.1,
  reactorLevel: 0.9,
  coolantLimit: 1_300,
};

/**
 * The spool's place on the power router. A tenth of its power ends
 * in the coolant loop, and the drive asks its demand from `ftlDemand`.
 */
export const FTL_SPOOL_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'ftl-spool',
  priority: 7,
  heatShare: 0.1,
};

/** The sector the ship sits in before its first jump. */
export const HOME_SECTOR = 'Sol';

/** True when the reactor and the coolant at the start of a tick let the spool charge. */
function spoolReady(
  reactor: ReactorRecord,
  coolant: CoolantRecord,
  rating: FtlRating,
): boolean {
  return (
    reactor.level >= rating.reactorLevel &&
    coolant.temperature < rating.coolantLimit
  );
}

/**
 * The power the spool asks the router for, in W, from the snapshot at the
 * start of the tick: the rating's power while the drive is armed and ready
 * below a full charge, and 0 W otherwise.
 */
export function ftlDemand(
  ftl: FtlRecord,
  setpoints: FtlSetpoints,
  reactor: ReactorRecord,
  coolant: CoolantRecord,
  rating: FtlRating,
): number {
  return setpoints.armed &&
    ftl.charge < rating.energy &&
    spoolReady(reactor, coolant, rating)
    ? rating.power
    : 0;
}

/** Everything one FTL step reads beside the record and the setpoints. */
interface FtlTick {
  /** The tick this step computes. */
  readonly tick: number;
  /** Seconds. */
  readonly dt: number;
  /** The router's `ftl-spool` allocation this tick, in W. */
  readonly allocated: number;
}

/**
 * What one FTL step gives. `pulse` is the heat a jump puts into the coolant
 * loop, in J, and 0 on every other tick.
 */
export interface FtlStep {
  readonly ftl: FtlRecord;
  readonly setpoints: FtlSetpoints;
  readonly pulse: number;
}

/**
 * Steps the FTL drive in phase 3.
 *
 * A commanded jump on a full charge empties the spool, moves the ship to the
 * commanded star, disarms the drive and gives the loop `pulseShare · energy`
 * of heat. Otherwise the spool charges by its allocation times `dt`, up to the
 * rating's energy, and the step derives the status on every tick. The charge
 * stays in J, so 450,000,000 J a tick reaches 90,000,000,000 J exactly. A step
 * that changes nothing returns the objects it got, and every record it builds
 * is frozen.
 */
export function stepFtl(
  ftl: FtlRecord,
  setpoints: FtlSetpoints,
  { tick, dt, allocated }: FtlTick,
  rating: FtlRating,
): FtlStep {
  if (setpoints.jump !== null && ftl.charge >= rating.energy) {
    return {
      ftl: Object.freeze({
        status: 'idle',
        charge: 0,
        sector: setpoints.jump,
        jumped: tick,
      }),
      setpoints: Object.freeze({ armed: false, jump: null }),
      pulse: rating.pulseShare * rating.energy,
    };
  }
  const charge = Math.min(rating.energy, ftl.charge + allocated * dt);
  const status: FtlStatus =
    charge >= rating.energy
      ? 'charged'
      : !setpoints.armed
        ? 'idle'
        : allocated > 0
          ? 'spooling'
          : 'held';
  const same = charge === ftl.charge && status === ftl.status;
  return {
    ftl: same ? ftl : Object.freeze({ ...ftl, status, charge }),
    setpoints,
    pulse: 0,
  };
}
