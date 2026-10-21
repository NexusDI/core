import { AIR, molesAt } from '../physics/gas';
import { LITHIUM_LOOP } from '../physics/thermal';
import type {
  LoggedChange,
  QueuedCommand,
  SetpointChange,
  Setpoints,
} from './commands';
import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentState,
  DECK_PLAN,
  type DeckPlan,
  type IShipState,
  type ShipSnapshot,
} from './contracts';

/** The most entries `log()` keeps. */
const LOG_SIZE = 1_000;

/**
 * Holds the current snapshot, which starts at tick 0 with the deck's initial
 * air and every system idle, and the setpoint changes the crew queued.
 */
export class ShipStateStore implements IShipState {
  static deps = [DECK_PLAN] as const;

  private current: ShipSnapshot;
  private queued: SetpointChange[] = [];
  private entries: LoggedChange[] = [];

  constructor(deck: DeckPlan) {
    this.current = initialSnapshot(deck);
  }

  snapshot(): ShipSnapshot {
    return this.current;
  }

  commit(next: ShipSnapshot): void {
    this.current = next;
  }

  queue(change: SetpointChange): QueuedCommand {
    this.queued.push(copyChange(change));
    return Object.freeze({ tick: this.current.tick + 1 });
  }

  applyQueued(tick: number): ShipSnapshot {
    if (this.queued.length === 0) return this.current;
    let setpoints = this.current.setpoints;
    for (const change of this.queued) {
      setpoints = mergeSetpoints(setpoints, change);
      this.entries.push(Object.freeze({ tick, change }));
    }
    this.queued = [];
    if (this.entries.length > LOG_SIZE) {
      this.entries.splice(0, this.entries.length - LOG_SIZE);
    }
    this.current = Object.freeze({ ...this.current, setpoints });
    return this.current;
  }

  log(): readonly LoggedChange[] {
    return Object.freeze([...this.entries]);
  }
}

/** A frozen copy of `change`, so a caller that keeps the object cannot alter the queue or the log. */
function copyChange(change: SetpointChange): SetpointChange {
  const copy: { -readonly [K in keyof Setpoints]?: Partial<Setpoints[K]> } = {};
  if (change.reactor) copy.reactor = Object.freeze({ ...change.reactor });
  if (change.shields) copy.shields = Object.freeze({ ...change.shields });
  return Object.freeze(copy);
}

function mergeSetpoints(
  setpoints: Setpoints,
  change: SetpointChange,
): Setpoints {
  return Object.freeze({
    reactor: change.reactor
      ? Object.freeze({ ...setpoints.reactor, ...change.reactor })
      : setpoints.reactor,
    shields: change.shields
      ? Object.freeze({ ...setpoints.shields, ...change.shields })
      : setpoints.shields,
  });
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
    reactor: Object.freeze({
      level: 0,
      thermal: 0,
      electric: 0,
      tripped: false,
    }),
    coolant: Object.freeze({ temperature: LITHIUM_LOOP.standby }),
    power: Object.freeze({
      output: 0,
      loads: Object.freeze([]),
      shed: Object.freeze([]),
    }),
    setpoints: Object.freeze({
      reactor: Object.freeze({ throttle: 0 }),
      shields: Object.freeze({ raised: false }),
    }),
  });
}
