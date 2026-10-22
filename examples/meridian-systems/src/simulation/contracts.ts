import { MultiToken, Token } from '@nexusdi/core';
import type { LifeSupportRecord, RoomPlan } from '../physics/atmosphere';
import type { CommsRecord } from '../physics/comms';
import type { DoorPlan } from '../physics/doors';
import type { FloodPlan } from '../physics/fire';
import type { Gas } from '../physics/gas';
import type { PowerRecord } from '../physics/power';
import type { SafetyRecord } from '../physics/safety';
import type { CoolantRecord, ReactorRecord } from '../physics/thermal';
import type {
  LoggedChange,
  QueuedCommand,
  SetpointChange,
  Setpoints,
} from './commands';

export interface SimOptions {
  readonly seed: number;
  /** Ship seconds per tick. */
  readonly dt: number;
}

/** Every compartment of the ship, in the order the snapshot lists them. */
export const COMPARTMENT_IDS = [
  'bridge',
  'habitat',
  'reactor-bay',
  'airlock',
] as const;
export type CompartmentId = (typeof COMPARTMENT_IDS)[number];

/** Every door of the ship. `ShipStateStore` checks the deck's doors against this list. */
export const DOOR_IDS = [
  'bridge-habitat',
  'habitat-reactor-bay',
  'habitat-airlock',
  'airlock-outer',
] as const;
export type DoorId = (typeof DOOR_IDS)[number];

export interface CompartmentState {
  readonly moles: Readonly<Record<Gas, number>>;
  /** Kelvin. */
  readonly temperature: number;
}

/**
 * The whole ship at one tick. The library owns this closed set of records,
 * and each later system adds its record here and its initial value in
 * `ShipStateStore`.
 */
export interface ShipSnapshot {
  readonly tick: number;
  /** Ship seconds, `tick * dt`. */
  readonly time: number;
  readonly compartments: Readonly<Record<CompartmentId, CompartmentState>>;
  readonly reactor: ReactorRecord;
  readonly coolant: CoolantRecord;
  readonly power: PowerRecord;
  readonly lifeSupport: LifeSupportRecord<CompartmentId>;
  readonly comms: CommsRecord;
  readonly safety: SafetyRecord<CompartmentId>;
  readonly setpoints: Setpoints;
}

export interface CompartmentReading extends CompartmentState {
  /**
   * Pascals, from the moles of every gas, the temperature and the deck
   * volume.
   */
  readonly pressure: number;
}

/**
 * What the routes and the telemetry feed send: the rounded snapshot with
 * each compartment's pressure, which `readShip` reads from the deck plan.
 */
export interface ShipReading extends Omit<ShipSnapshot, 'compartments'> {
  readonly compartments: Readonly<Record<CompartmentId, CompartmentReading>>;
}

/**
 * One compartment of the deck: its volume, hull and crew, the life-support
 * devices it carries (`RoomPlan` documents each field) and its flood charge
 * (`FloodPlan`). The ids are strings because a JSON import types them so.
 * `ShipStateStore` checks them against `COMPARTMENT_IDS` and the devices
 * against `LIFE_SUPPORT_DEVICES`. It also checks the charge when the
 * container builds it.
 */
export type CompartmentPlan = RoomPlan & FloodPlan;

export type { DoorPlan } from '../physics/doors';

/** The shape of `deck/meridian.deck.json`. */
export interface DeckPlan {
  readonly compartments: readonly CompartmentPlan[];
  /** `ShipStateStore` checks the ids against `DOOR_IDS` and the sides against `COMPARTMENT_IDS`. */
  readonly doors: readonly DoorPlan[];
  readonly initial: {
    /** Kelvin. */
    readonly temperature: number;
    /** Pascals. */
    readonly pressure: number;
  };
}

/** The order a tick runs the systems in, from engineering (1) to comms (6). */
export type Phase = 1 | 2 | 3 | 4 | 5 | 6;

export interface IRandomSource {
  /** The next number in [0, 1). */
  next(): number;
  /** A source whose stream depends on this source's seed and `label` alone. */
  fork(label: string): IRandomSource;
}

export interface ISimClock {
  readonly dt: number;
  readonly tick: number;
  readonly time: number;
  /** Moves to the next tick and returns its number. */
  advance(): number;
}

export interface IShipState {
  snapshot(): ShipSnapshot;
  commit(next: ShipSnapshot): void;
  /**
   * Merges `change` over the change pending for the next tick, level by
   * level, the later value winning, and answers with that tick.
   */
  queue(change: SetpointChange): QueuedCommand;
  /**
   * Merges the pending change over the setpoints, logs it as one entry
   * under `tick`, clears it, commits the result and returns it. The tick
   * loop calls it at step 1 of tick `tick`.
   */
  applyQueued(tick: number): ShipSnapshot;
  /**
   * The newest 1,000 entries, oldest first. Each entry holds the merged
   * change one tick applied, so the log covers 1,000 ticks.
   */
  log(): readonly LoggedChange[];
}

export interface TickContext {
  /** The tick this step computes. */
  readonly tick: number;
  readonly dt: number;
  /** The system's own fork of `RNG`. */
  readonly rng: IRandomSource;
  /**
   * The snapshot `applyQueued` returned for this tick, before any system
   * stepped: the air at the start of the tick and the alarms of the tick
   * before.
   */
  readonly start: ShipSnapshot;
}

export interface IShipSystem {
  /**
   * Unique across the ship. The loop forks `RNG` with it and orders a phase
   * by it.
   */
  readonly name: string;
  readonly phase: Phase;
  step(ship: ShipSnapshot, tick: TickContext): ShipSnapshot;
}

/**
 * A ship system class that declares its phase statically, so the graph reads
 * the phase without building the class.
 */
export interface ShipSystemClass {
  readonly phase: Phase;
}

/** Hears each snapshot the loop commits. */
export type TickListener = (ship: ShipSnapshot) => void;

export interface ITickLoop {
  /**
   * Runs `ticks` ticks and returns the last snapshot. When a listener throws,
   * the tick stays committed and `advance` throws after that tick.
   */
  advance(ticks: number): ShipSnapshot;
  /**
   * Calls `listener` after each committed tick, in subscription order, and
   * returns a function that unsubscribes it. A listener must not call
   * `advance()`, since the loop is still inside the tick.
   */
  listen(listener: TickListener): () => void;
}

export const SIM_OPTIONS = new Token<SimOptions>('SimOptions');
export const SIM_CLOCK = new Token<ISimClock>('SimClock');
export const RNG = new Token<IRandomSource>('RandomSource');
export const SHIP_STATE = new Token<IShipState>('ShipState');
export const SHIP_SYSTEMS = new MultiToken<IShipSystem>('ShipSystems');
export const TICK_LOOP = new Token<ITickLoop>('TickLoop');
export const DECK_PLAN = new Token<DeckPlan>('DeckPlan');

declare module '@nexusdi/core' {
  interface NexusRequest {
    /**
     * The compartment a request reads, as the path names it. `COMPARTMENT`
     * checks it against `COMPARTMENT_IDS`.
     */
    compartment?: string;
  }
}

/**
 * The compartment of the current request: scoped, and refused with
 * `UnknownCompartmentError` on `get` when the request names none or one the
 * deck does not have.
 */
export const COMPARTMENT = new Token<CompartmentId>('Compartment');
