import { AIR, molesAt } from '../physics/gas';
import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentState,
  DECK_PLAN,
  type DeckPlan,
  type IShipState,
  type ShipSnapshot,
} from './contracts';

/** Holds the current snapshot, which starts as the deck's initial air at tick 0. */
export class ShipStateStore implements IShipState {
  static deps = [DECK_PLAN] as const;

  private current: ShipSnapshot;

  constructor(deck: DeckPlan) {
    this.current = initialSnapshot(deck);
  }

  snapshot(): ShipSnapshot {
    return this.current;
  }

  commit(next: ShipSnapshot): void {
    this.current = next;
  }
}

function initialSnapshot(deck: DeckPlan): ShipSnapshot {
  const { temperature, pressure } = deck.initial;
  const seen = new Set<string>();
  for (const room of deck.compartments) {
    if (!(COMPARTMENT_IDS as readonly string[]).includes(room.id)) {
      throw new Error(
        `The deck plan names an unknown compartment '${room.id}'.`,
      );
    }
    if (seen.has(room.id)) {
      throw new Error(`The deck plan names compartment '${room.id}' twice.`);
    }
    seen.add(room.id);
  }
  const compartments = {} as Record<CompartmentId, CompartmentState>;
  for (const id of COMPARTMENT_IDS) {
    const room = deck.compartments.find((plan) => plan.id === id);
    if (!room) throw new Error(`The deck plan has no compartment '${id}'.`);
    compartments[id] = Object.freeze({
      moles: Object.freeze(molesAt(pressure, temperature, room.volume, AIR)),
      temperature,
    });
  }
  return Object.freeze({
    tick: 0,
    time: 0,
    compartments: Object.freeze(compartments),
  });
}
