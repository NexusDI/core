import { MultiToken, Token } from '@nexusdi/core';
import type { Gas } from '../physics/gas';

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
 * The ids are strings because a JSON import types them so. `ShipStateStore`
 * checks them against `COMPARTMENT_IDS` when the container builds it.
 */
export interface CompartmentPlan {
  readonly id: string;
  /** Cubic metres. */
  readonly volume: number;
  /** Hull conductance in W/K. */
  readonly conductance: number;
  /** J/K. */
  readonly structureHeatCapacity: number;
  readonly occupants: number;
}

export interface DoorPlan {
  readonly id: string;
  /** Two compartment ids, or one and `space`. */
  readonly between: readonly string[];
  /** Square metres. */
  readonly area: number;
}

/** The shape of `deck/meridian.deck.json`. */
export interface DeckPlan {
  readonly compartments: readonly CompartmentPlan[];
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
}

export interface TickContext {
  /** The tick this step computes. */
  readonly tick: number;
  readonly dt: number;
  /** The system's own fork of `RNG`. */
  readonly rng: IRandomSource;
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
