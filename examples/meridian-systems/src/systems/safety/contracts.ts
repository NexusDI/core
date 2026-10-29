import { MultiToken, Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';

/** The name safety answers to on the command desk. */
export const SAFETY_SYSTEM = 'safety';

/**
 * The actions safety takes and their arguments, in words. shipText reads it
 * after "It takes".
 */
export const SAFETY_ACTIONS =
  'open and close with a door of bridge-habitat, habitat-airlock, airlock-outer, bridge-chart-room, bridge-computer-core, habitat-quarters, habitat-comms-relay, airlock-shuttle-bay, shuttle-bay-outer, shuttle-bay-drone-bay, drone-bay-outer, habitat-engineering, engineering-capacitor-room, engineering-ftl-core, engineering-reactor-bay or reactor-bay-main-drive, and flood and drill with a compartment of bridge, habitat, reactor-bay, chart-room, computer-core, quarters, comms-relay, capacitor-room, engineering, ftl-core or main-drive';

/** Every alarm the safety step raises, in the order it evaluates them for a room. */
export type AlarmCode =
  | 'FIRE'
  | 'SENSOR_FAULT'
  | 'HYPOXIA'
  | 'CO2_HIGH'
  | 'PRESSURE_LOW'
  | 'TEMPERATURE'
  | 'DECOMPRESSION'
  | 'COOLANT_HIGH'
  | 'REACTOR_TRIP'
  | 'LOAD_SHED';

export interface Alarm {
  readonly code: AlarmCode;
  /** The compartment, the shed load's id, or `reactor`. */
  readonly subject: string;
}

/** Safety at the end of a tick. `Id` narrows the keys to the deck's ids. */
export interface SafetyRecord<Id extends string = string> {
  /** The fire intensity φ of each compartment, 0 to 1, with 0 for no fire. */
  readonly fires: Readonly<Record<Id, number>>;
  /** The moles of N₂ the running flood of each charged room has released. */
  readonly flooded: Readonly<Partial<Record<Id, number>>>;
  /** The active alarms, in the order the step raised them. */
  readonly alarms: readonly Alarm[];
}

/** What the crew set for safety. `Door` narrows the door keys to the deck's ids. */
export interface SafetySetpoints<
  Id extends string = string,
  Door extends string = string,
> {
  /** True while the door stands open. */
  readonly doors: Readonly<Record<Door, boolean>>;
  /** True while the room's flood valve releases its charge. */
  readonly floods: Readonly<Partial<Record<Id, boolean>>>;
  /** True from the command until the tick that lights the drill fire. */
  readonly drills: Readonly<Partial<Record<Id, boolean>>>;
}

/** The flood charge a compartment of the deck may carry. */
export interface FloodPlan {
  /** Moles of N₂ one flood releases. */
  readonly floodCharge?: number;
}

/**
 * The blast-door panel. Each method queues the door's setpoint for the next
 * tick and throws `BadCommandError` (`reason: 'argument'`) for a door the
 * deck lacks. A command for the state a door already holds queues and
 * changes nothing.
 */
export interface IBlastDoors {
  open(door: string): QueuedCommand;
  close(door: string): QueuedCommand;
}

/**
 * The fire-suppression panel. Each method queues a setpoint for the next
 * tick and throws `BadCommandError` (`reason: 'argument'`) for a
 * compartment with no flood charge on the deck.
 */
export interface IFireSuppression {
  /** Opens the room's flood valve, which releases its charge of N₂ over 10 s. */
  flood(compartment: string): QueuedCommand;
  /**
   * Lights a drill fire in the room on the next tick when its air burns.
   * The flag clears on that tick, lit or not.
   */
  drill(compartment: string): QueuedCommand;
}

/** Hears each alarm the master alarm raises and clears. */
export interface IAlarmSink {
  /** `tick` is the tick whose snapshot first held the alarm. */
  raise(alarm: Alarm, tick: number): void;
  /** `tick` is the first tick whose snapshot no longer held the alarm. */
  clear(alarm: Alarm, tick: number): void;
}

export interface IMasterAlarm {
  /** The alarms of the last tick, in the order the safety step raised them. */
  active(): readonly Alarm[];
}

export const BLAST_DOORS = new Token<IBlastDoors>('BlastDoors');
export const FIRE_SUPPRESSION = new Token<IFireSuppression>('FireSuppression');
/** Every sink the master alarm tells. A module contributes one with `provide(ALARM_SINKS, ...)`. */
export const ALARM_SINKS = new MultiToken<IAlarmSink>('AlarmSinks');
export const MASTER_ALARM = new Token<IMasterAlarm>('MasterAlarm');

declare module '../../simulation/contracts' {
  interface ShipRecords {
    readonly safety: SafetyRecord<CompartmentId>;
  }
  interface ShipSetpoints {
    readonly safety: SafetySetpoints<CompartmentId, DoorId>;
  }
}
