import { MultiToken, Token } from '@nexusdi/core';

import type { Alarm } from '../../physics/safety';
import { commandRefusal } from '../../simulation/command-arguments';
import type { QueuedCommand } from '../../simulation/commands';

/**
 * The actions safety takes and their arguments, in words. shipText reads it
 * after "It takes".
 */
export const SAFETY_ACTIONS =
  'open and close with a door of bridge-habitat, habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a compartment of bridge, habitat or reactor-bay';

/** The `BadCommandError` safety throws for an action or an argument it cannot read. */
export const refuseSafety = commandRefusal('safety', SAFETY_ACTIONS);

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
