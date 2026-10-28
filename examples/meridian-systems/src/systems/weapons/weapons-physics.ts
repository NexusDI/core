import { LITHIUM_LOOP, pulseCoolant } from '../../physics/thermal';
import { RAILGUN_LOAD, stepWeapons } from '../../physics/weapons';
import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { type IWeaponMount, WEAPON_MOUNT } from './contracts';

/** Steps the railgun in phase 3 of each tick. */
export class WeaponsPhysics implements IShipSystem {
  static deps = [WEAPON_MOUNT] as const;
  static readonly phase: Phase = 3;

  readonly name = 'Weapons';
  readonly phase = WeaponsPhysics.phase;

  constructor(private readonly mount: IWeaponMount) {}

  /**
   * The capacitor charges with the power the router allocated the railgun
   * load in phase 1. A shot draws its hit from the tick's `rng`, the loop's
   * fork for Weapons, and its pulse enters the loop here, with the heat
   * capacity of `LITHIUM_LOOP`. On a tick that changes nothing, the ship
   * comes back as it went in.
   */
  step(ship: ShipSnapshot, { tick, dt, rng }: TickContext): ShipSnapshot {
    const load = ship.power.loads.find(({ id }) => id === RAILGUN_LOAD.id);
    const next = stepWeapons(
      ship.weapons,
      ship.setpoints.weapons,
      {
        tick,
        dt,
        allocated: load?.allocated ?? 0,
        shed: ship.power.shed.includes(RAILGUN_LOAD.id),
        draw: () => rng.next(),
      },
      this.mount.rating,
    );
    if (
      next.weapons === ship.weapons &&
      next.setpoints === ship.setpoints.weapons
    ) {
      return ship;
    }
    return Object.freeze({
      ...ship,
      weapons: next.weapons,
      coolant:
        next.pulse === 0
          ? ship.coolant
          : pulseCoolant(ship.coolant, next.pulse, LITHIUM_LOOP),
      setpoints:
        next.setpoints === ship.setpoints.weapons
          ? ship.setpoints
          : Object.freeze({ ...ship.setpoints, weapons: next.setpoints }),
    });
  }
}
