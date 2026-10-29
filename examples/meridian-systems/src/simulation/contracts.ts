import { MultiToken, Token } from '@nexusdi/core';

import type { DoorPlan } from '../physics/doors';
import type { Gas } from '../physics/gas';
import type { FloodPlan } from '../systems/safety/contracts';
import type { RoomPlan } from '../systems/life-support/contracts';

import type { LoggedChange, QueuedCommand, SetpointChange } from './commands';

export interface SimOptions {
  readonly seed: number;
  /** Ship seconds per tick. */
  readonly dt: number;
  /**
   * The ship's files, such as the sensor calibration. Without them the ship
   * reads the copies the library bundles.
   */
  readonly files?: IShipFiles;
}

/** The files a ship reads at startup, by name. */
export interface IShipFiles {
  /** The parsed JSON of the file `name`. Rejects when the file cannot be read. */
  read(name: string): Promise<unknown>;
}

/** Every compartment of the ship, in the order the snapshot lists them. */
export const COMPARTMENT_IDS = [
  'bridge',
  'habitat',
  'reactor-bay',
  'airlock',
  'chart-room',
  'computer-core',
  'quarters',
  'comms-relay',
  'shuttle-bay',
  'drone-bay',
  'capacitor-room',
  'engineering',
  'ftl-core',
  'main-drive',
] as const;
export type CompartmentId = (typeof COMPARTMENT_IDS)[number];

/** Every door of the ship. `checkDeckPlan` checks the deck's doors against this list. */
export const DOOR_IDS = [
  'bridge-habitat',
  'habitat-airlock',
  'airlock-outer',
  'bridge-chart-room',
  'bridge-computer-core',
  'habitat-quarters',
  'habitat-comms-relay',
  'airlock-shuttle-bay',
  'shuttle-bay-outer',
  'shuttle-bay-drone-bay',
  'drone-bay-outer',
  'habitat-engineering',
  'engineering-capacitor-room',
  'engineering-ftl-core',
  'engineering-reactor-bay',
  'reactor-bay-main-drive',
] as const;
export type DoorId = (typeof DOOR_IDS)[number];

export interface CompartmentState {
  readonly moles: Readonly<Record<Gas, number>>;
  /** Kelvin. */
  readonly temperature: number;
}

/**
 * The record of each system, by its key in the snapshot. Each system's
 * `contracts.ts` adds its own records here, so the snapshot names no system.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- each system's contracts.ts adds its records.
export interface ShipRecords {}

/**
 * What the crew asks of each system, by its key in the snapshot's
 * setpoints. A system steps toward its setpoint each tick. Each system's
 * `contracts.ts` adds its own setpoints here.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type -- each system's contracts.ts adds its setpoints.
export interface ShipSetpoints {}

/**
 * The whole ship at one tick: the kernel's tick, time and compartments, the
 * record of each system and the setpoints.
 */
export interface ShipSnapshot extends ShipRecords {
  readonly tick: number;
  /** Ship seconds, `tick * dt`. */
  readonly time: number;
  readonly compartments: Readonly<Record<CompartmentId, CompartmentState>>;
  readonly setpoints: ShipSetpoints;
}

/**
 * One system's part of the snapshot at tick 0: its records and the setpoints
 * the crew starts it at. A system module contributes one to `SHIP_RECORDS`.
 */
export interface SystemRecord {
  readonly records: Partial<ShipRecords>;
  readonly setpoints: Partial<ShipSetpoints>;
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
 * devices it carries (`RoomPlan` documents each field), its flood charge
 * (`FloodPlan`) and whether it holds air. The ids are strings because a JSON
 * import types them so. `checkDeckPlan` checks them against
 * `COMPARTMENT_IDS` and the devices against `LIFE_SUPPORT_DEVICES`, and
 * `ShipStateStore` runs the check when the container builds it.
 */
export interface CompartmentPlan extends RoomPlan, FloodPlan {
  /**
   * False for a room that holds vacuum, such as a bay open to space, which
   * starts with no gas and carries no device and no flood charge. True when
   * absent.
   */
  readonly pressurised?: boolean;
}

export type { DoorPlan } from '../physics/doors';

/** The shape of `deck/meridian.deck.json`. */
export interface DeckPlan {
  readonly compartments: readonly CompartmentPlan[];
  /** `checkDeckPlan` checks the ids against `DOOR_IDS` and the sides against `COMPARTMENT_IDS`. */
  readonly doors: readonly DoorPlan[];
  readonly initial: {
    /** Kelvin. */
    readonly temperature: number;
    /** Pascals. */
    readonly pressure: number;
  };
}

/** The phases of a tick, in the order it runs the systems: engineering (1) to comms (6). */
export const PHASES = [1, 2, 3, 4, 5, 6] as const;

/** One phase of a tick. */
export type Phase = (typeof PHASES)[number];

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
  /**
   * Makes `next` the current snapshot with the record and setpoint keys the
   * contributions and the registers hold now, so a register or an unregister
   * during a tick reaches the snapshot the tick commits.
   */
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
  /**
   * Writes `record`'s records and setpoints into the current snapshot and
   * returns a function that removes those keys from the snapshot, the
   * setpoints and the pending change, and runs twice safely. A module that
   * `load()` adds cannot contribute to SHIP_RECORDS, so its record joins
   * this way. Throws for a key an earlier register holds.
   */
  register(record: SystemRecord): () => void;
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
  /**
   * Runs `system` in its phase from the next tick on, with the fork for its
   * name, and returns a function that removes it and runs twice safely. A
   * module that `load()` adds cannot contribute to SHIP_SYSTEMS, so its system
   * joins this way. Throws for a name the loop runs.
   */
  register(system: IShipSystem): () => void;
}

export const SIM_OPTIONS = new Token<SimOptions>('SimOptions');
export const SIM_CLOCK = new Token<ISimClock>('SimClock');
export const RNG = new Token<IRandomSource>('RandomSource');
export const SHIP_STATE = new Token<IShipState>('ShipState');
export const SHIP_SYSTEMS = new MultiToken<IShipSystem>('ShipSystems');
export const SHIP_RECORDS = new MultiToken<SystemRecord>('ShipRecords');
export const TICK_LOOP = new Token<ITickLoop>('TickLoop');
export const DECK_PLAN = new Token<DeckPlan>('DeckPlan');
export const SHIP_FILES = new Token<IShipFiles>('ShipFiles');

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
