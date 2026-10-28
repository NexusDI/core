import {
  COMPARTMENT_IDS,
  DECK_PLAN,
  type DeckPlan,
  type IShipSystem,
  type Phase,
  type ShipSnapshot,
  type TickContext,
} from '../../simulation/contracts';
import {
  ATMOSPHERE_PROBE,
  type IAtmosphereProbe,
} from '../life-support/contracts';

import { stepSafety } from './safety-model';

/** Runs the doors, the fires, the floods and the alarms in phase 5 of each tick. */
export class SafetyPhysics implements IShipSystem {
  // ATMOSPHERE_PROBE is LifeSupport's. It reaches Safety through the global
  // MeridianSystems, which re-exports LifeSupport.
  static deps = [DECK_PLAN, ATMOSPHERE_PROBE] as const;

  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 5;

  readonly name = 'Safety';
  readonly phase = SafetyPhysics.phase;

  constructor(
    private readonly deck: DeckPlan,
    private readonly probe: IAtmosphereProbe,
  ) {}

  /**
   * The alarms read the air of `tick.start` at the tick before and the
   * stepped air at this tick, and the deadband reads the alarms of
   * `tick.start`. The step has no online gate, so fires and floods run while
   * life support is offline.
   */
  step(ship: ShipSnapshot, tick: TickContext): ShipSnapshot {
    const result = stepSafety({
      ids: COMPARTMENT_IDS,
      start: {
        compartments: tick.start.compartments,
        alarms: tick.start.safety.alarms,
      },
      compartments: ship.compartments,
      rooms: this.deck.compartments,
      doors: this.deck.doors,
      setpoints: ship.setpoints.safety,
      record: ship.safety,
      engineering: {
        coolant: ship.coolant.temperature,
        tripped: ship.reactor.tripped,
        shed: ship.power.shed,
      },
      read: (id, air, at) => this.probe.read(id, air, at),
      draw: () => tick.rng.next(),
      tick: tick.tick,
      dt: tick.dt,
    });
    const setpoints =
      result.setpoints === ship.setpoints.safety
        ? ship.setpoints
        : Object.freeze({ ...ship.setpoints, safety: result.setpoints });
    return Object.freeze({
      ...ship,
      compartments: result.compartments as ShipSnapshot['compartments'],
      safety: result.safety,
      setpoints,
    });
  }
}
