import { all } from '@nexusdi/core';

import { AIR, molesAt } from '../physics/gas';

import { byCodeUnit } from './by-code-unit';
import type {
  DeepPartial,
  LoggedChange,
  QueuedCommand,
  SetpointChange,
} from './commands';
import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentState,
  DECK_PLAN,
  type DeckPlan,
  type IShipState,
  SHIP_RECORDS,
  type ShipSetpoints,
  type ShipSnapshot,
  type SystemRecord,
} from './contracts';
import { checkDeckPlan } from './deck-plan-check';

/**
 * The most entries `log()` keeps. The store logs one entry per tick that
 * applied a change, so the log covers the newest 1,000 such ticks.
 */
const LOG_SIZE = 1_000;

/** The snapshot's own fields, which the store lists before every record. */
const KERNEL_KEYS = ['tick', 'time', 'compartments'] as const;

/**
 * Holds the current snapshot and one pending change: the merge of every
 * setpoint change the crew queued since the last tick. The snapshot starts
 * at tick 0 with the deck's initial air in each pressurised room, no gas in
 * a room that holds vacuum, and the records and setpoints of every
 * `SHIP_RECORDS` contribution, keyed in code-unit order so the order of the
 * imports never reaches a reading. A client that sends commands in a loop
 * between two ticks replaces fields of that one change, so the store keeps
 * one change however many commands arrive. No contribution reads
 * `SHIP_STATE`, so the store reads them with a plain `all()`.
 */
export class ShipStateStore implements IShipState {
  static deps = [DECK_PLAN, all(SHIP_RECORDS)] as const;

  private current: ShipSnapshot;
  private pending: SetpointChange | undefined;
  private entries: LoggedChange[] = [];
  /** The record keys and the setpoint keys the contributions and each register hold. */
  private readonly held = {
    records: new Set<string>(),
    setpoints: new Set<string>(),
  };

  constructor(deck: DeckPlan, records: readonly SystemRecord[]) {
    checkDeckPlan(deck);
    const parts: Record<string, unknown> = {};
    const setpoints: Record<string, unknown> = {};
    for (const record of records) {
      this.hold(record);
      Object.assign(parts, record.records);
      Object.assign(setpoints, record.setpoints);
    }
    this.current = ordered({
      ...parts,
      tick: 0,
      time: 0,
      compartments: initialCompartments(deck),
      setpoints,
    });
  }

  snapshot(): ShipSnapshot {
    return this.current;
  }

  /**
   * A step that registers or unregisters a record changes the current
   * snapshot while the loop still holds the snapshot the tick started from,
   * so the commit keeps the keys the store holds now.
   */
  commit(next: ShipSnapshot): void {
    this.current = this.withHeldKeys(next);
  }

  queue(change: SetpointChange): QueuedCommand {
    this.pending = mergeFrozen<SetpointChange>(this.pending ?? {}, change);
    return Object.freeze({ tick: this.current.tick + 1 });
  }

  applyQueued(tick: number): ShipSnapshot {
    const change = this.pending;
    if (!change) return this.current;
    this.pending = undefined;
    const setpoints = mergeFrozen<ShipSetpoints>(
      this.current.setpoints,
      change,
    );
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

  register(record: SystemRecord): () => void {
    this.hold(record);
    const records = Object.keys(record.records);
    const setpoints = Object.keys(record.setpoints);
    this.current = ordered({
      ...this.current,
      ...record.records,
      setpoints: { ...this.current.setpoints, ...record.setpoints },
    });
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      for (const key of records) this.held.records.delete(key);
      for (const key of setpoints) this.held.setpoints.delete(key);
      this.current = Object.freeze({
        ...without(this.current, records),
        setpoints: Object.freeze(without(this.current.setpoints, setpoints)),
      });
      const pending = this.pending && without(this.pending, setpoints);
      this.pending =
        pending && Object.keys(pending).length > 0
          ? Object.freeze(pending)
          : undefined;
    };
  }

  /**
   * `next` with the record keys and the setpoint keys the store holds: a key
   * no contribution or register holds leaves, and a held key `next` lacks
   * comes from the current snapshot. A snapshot with the held keys comes
   * back as it is.
   */
  private withHeldKeys(next: ShipSnapshot): ShipSnapshot {
    const records = recordKeys(next);
    const setpoints = Object.keys(next.setpoints);
    if (
      sameKeys(records, this.held.records) &&
      sameKeys(setpoints, this.held.setpoints)
    ) {
      return next;
    }
    const pick = (keys: ReadonlySet<string>, from: object, fallback: object) =>
      Object.fromEntries(
        [...keys].map((key) => [
          key,
          ownValue(Object.hasOwn(from, key) ? from : fallback, key),
        ]),
      );
    return ordered({
      ...pick(this.held.records, next, this.current),
      tick: next.tick,
      time: next.time,
      compartments: next.compartments,
      setpoints: pick(
        this.held.setpoints,
        next.setpoints,
        this.current.setpoints,
      ),
    });
  }

  /**
   * Takes the keys of `record`, refusing the snapshot's own keys and a key a
   * contribution or an earlier register holds.
   */
  private hold(record: SystemRecord): void {
    const records = Object.keys(record.records);
    const setpoints = Object.keys(record.setpoints);
    const own = records.find(
      (key) =>
        key === 'setpoints' || (KERNEL_KEYS as readonly string[]).includes(key),
    );
    if (own !== undefined) {
      throw new Error(
        `A ship record cannot hold the snapshot's own key '${own}'.`,
      );
    }
    for (const [keys, held] of [
      [records, this.held.records],
      [setpoints, this.held.setpoints],
    ] as const) {
      const taken = keys.find((key) => held.has(key));
      if (taken !== undefined) {
        throw new Error(`Two ship records hold the key '${taken}'.`);
      }
    }
    for (const key of records) this.held.records.add(key);
    for (const key of setpoints) this.held.setpoints.add(key);
  }
}

/** A copy of `value` without `keys`. */
function without<T extends object>(value: T, keys: readonly string[]): T {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  ) as T;
}

/** The value `value` holds under its own key `key`. */
function ownValue(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** The record keys of `ship`: every key but the kernel's and `setpoints`. */
function recordKeys(ship: ShipSnapshot): string[] {
  return Object.keys(ship).filter(
    (key) =>
      key !== 'setpoints' && !(KERNEL_KEYS as readonly string[]).includes(key),
  );
}

/** True when `keys` lists each key of `held` once and no other. */
function sameKeys(keys: readonly string[], held: ReadonlySet<string>): boolean {
  return keys.length === held.size && keys.every((key) => held.has(key));
}

/**
 * A frozen snapshot of `ship` with the kernel's fields first, then each
 * record and, last, the setpoints, each record and setpoint keyed in
 * code-unit order and frozen at every level.
 */
function ordered(ship: Record<string, unknown>): ShipSnapshot {
  const { setpoints, ...fields } = ship;
  const records = Object.keys(fields)
    .filter((key) => !(KERNEL_KEYS as readonly string[]).includes(key))
    .sort(byCodeUnit);
  const sorted = (value: object) =>
    Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => byCodeUnit(a, b)),
    );
  const next: Record<string, unknown> = {};
  for (const key of [...KERNEL_KEYS, ...records]) next[key] = fields[key];
  next.setpoints = sorted(isPlainObject(setpoints) ? setpoints : {});
  return mergeFrozen(next, {}) as unknown as ShipSnapshot;
}

/**
 * The deck's initial air in each pressurised room at its initial
 * temperature, and no gas in a room that holds vacuum.
 */
function initialCompartments(
  deck: DeckPlan,
): Readonly<Record<CompartmentId, CompartmentState>> {
  const { temperature, pressure } = deck.initial;
  const compartments = {} as Record<CompartmentId, CompartmentState>;
  for (const id of COMPARTMENT_IDS) {
    const room = deck.compartments.find((plan) => plan.id === id);
    if (room === undefined) {
      throw new Error(`The deck plan has no compartment '${id}'.`);
    }
    const fill = room.pressurised === false ? 0 : pressure;
    compartments[id] = {
      moles: molesAt(fill, temperature, room.volume, AIR),
      temperature,
    };
  }
  return compartments;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** `value` when it is frozen, else a frozen copy of every plain object level under it. */
function frozen(value: unknown): unknown {
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze([...(value as unknown[])]);
  if (isPlainObject(value)) return mergeFrozen(value, {});
  return value;
}

/**
 * A new frozen object that holds `base` with `change` merged over it, the
 * later value winning. A plain object in `change` merges key by key into the
 * one at the same key of `base`; a primitive or an array replaces the value
 * there. A key set to undefined leaves the value of `base` in place. The
 * merge copies every level it touches and freezes every level of the result,
 * so a caller that keeps `base` or `change` cannot alter the setpoints, the
 * pending change or the log.
 */
function mergeFrozen<T extends object>(base: T, change: DeepPartial<T>): T {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    merged[key] = frozen(value);
  }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] = isPlainObject(value)
      ? mergeFrozen(isPlainObject(current) ? current : {}, value)
      : frozen(value);
  }
  return Object.freeze(merged) as T;
}
