import { AIR, molesAt } from '../physics/gas';
import { allocatePower, DEFLECTOR_GRID } from '../physics/power';
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

/**
 * The most entries `log()` keeps. The store logs one entry per tick that
 * applied a change, so the log covers the newest 1,000 such ticks.
 */
const LOG_SIZE = 1_000;

/**
 * Holds the current snapshot, which starts at tick 0 with the deck's initial
 * air and every system idle, and one pending change: the merge of every
 * setpoint change the crew queued since the last tick. A client that sends
 * commands in a loop between two ticks replaces fields of that one change,
 * so the store keeps one change however many commands arrive.
 */
export class ShipStateStore implements IShipState {
  static deps = [DECK_PLAN] as const;

  private current: ShipSnapshot;
  private pending: SetpointChange | undefined;
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
    this.pending = mergeChange(this.pending, change);
    return Object.freeze({ tick: this.current.tick + 1 });
  }

  applyQueued(tick: number): ShipSnapshot {
    const change = this.pending;
    if (!change) return this.current;
    this.pending = undefined;
    const setpoints = mergeSetpoints(this.current.setpoints, change);
    this.entries.push(Object.freeze({ tick, change }));
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

/**
 * A new frozen change that holds `pending` with `change` merged over it field
 * by field inside each record, the later value winning. It drops the fields
 * `change` sets to undefined and leaves `pending` as it was, so a caller that
 * keeps either object cannot alter the pending change or the log.
 */
function mergeChange(
  pending: SetpointChange | undefined,
  change: SetpointChange,
): SetpointChange {
  const merged: { -readonly [K in keyof Setpoints]?: Partial<Setpoints[K]> } = {
    ...pending,
  };
  if (change.reactor) {
    merged.reactor = Object.freeze({
      ...pending?.reactor,
      ...definedFields(change.reactor),
    });
  }
  if (change.shields) {
    merged.shields = Object.freeze({
      ...pending?.shields,
      ...definedFields(change.shields),
    });
  }
  return Object.freeze(merged);
}

/**
 * A copy of `fields` without the keys set to undefined. `Partial`
 * lets a caller write `{ throttle: undefined }`, and a merge of that key
 * would leave undefined in the setpoints.
 */
function definedFields<T extends object>(fields: T): T {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as T;
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
  const power = allocatePower(0, [{ ...DEFLECTOR_GRID, demand: 0 }]);
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
      ...power,
      loads: Object.freeze(power.loads.map((entry) => Object.freeze(entry))),
      shed: Object.freeze(power.shed),
    }),
    setpoints: Object.freeze({
      reactor: Object.freeze({ throttle: 0 }),
      shields: Object.freeze({ raised: false }),
    }),
  });
}
