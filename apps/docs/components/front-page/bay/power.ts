import type { TraceEvent } from '@nexusdi/core';
import type { SystemId } from '@nexusdi/meridian/scenes/front-page';

import { PLACEMENT, type ModuleName } from '../placement';
import { SYSTEM_IDS, SYSTEM_WORD } from './geometry';
import type { BayState } from './state';

/**
 * The power-up as a reducer (site UX spec 4.4): the ship's status of each
 * system and the power of each room follow the trace events core emits, and
 * nothing else. A check never lights a room (5.10), so `applyEvent` is the
 * only way a room gains power. The server renders the seed's final state by
 * folding the seed fixture's events with the same function.
 */

/** The status of a system: a glyph, a word and a hue (design system 7.5). */
export type SystemStatus =
  'idle' | 'active' | 'nominal' | 'standby' | 'alarm' | 'offline';

export type Lifetime = 'singleton' | 'transient' | 'scoped';

/** The lifetime of each system's provider in the seed (`rootOf`). */
export const LIFETIME: Readonly<Record<SystemId, Lifetime>> = {
  ReactorCore: 'singleton',
  ShipComputer: 'singleton',
  SubspaceLink: 'singleton',
  NavCharts: 'singleton',
  SurveyDrone: 'transient',
  FlightLog: 'scoped',
  DiagnosticsPanel: 'singleton',
};

/** The module of each system: the hull section it lights. */
export const MODULE_OF: Readonly<Record<SystemId, ModuleName>> = {
  ReactorCore: 'Engineering',
  ShipComputer: 'Engineering',
  SubspaceLink: 'Comms',
  NavCharts: 'Tactical',
  SurveyDrone: 'Tactical',
  FlightLog: 'BridgeApi',
  DiagnosticsPanel: 'Meridian',
};

export interface Power {
  readonly systems: Readonly<Record<SystemId, SystemStatus>>;
}

function isSystem(token: string): token is SystemId {
  return (SYSTEM_IDS as readonly string[]).includes(token);
}

/** The room a system sits in. */
export function roomOfSystem(id: SystemId): string {
  return (PLACEMENT.providers[id] as string).split('.')[0] as string;
}

/**
 * The ship before a launch has built anything: each present singleton idle, a
 * transient or scoped system on standby, a removed system offline.
 */
export function darkPower(state: BayState): Power {
  return {
    systems: Object.fromEntries(
      SYSTEM_IDS.map((id) => [
        id,
        !state.systems[id]
          ? 'offline'
          : LIFETIME[id] === 'singleton'
            ? 'idle'
            : 'standby',
      ]),
    ) as Record<SystemId, SystemStatus>,
  };
}

/** One event's effect on the systems. An event the bay does not know changes nothing (P2). */
export function applyEvent(power: Power, event: TraceEvent): Power {
  switch (event.type) {
    case 'construct:await':
    case 'construct':
    case 'construct:failed':
    case 'dispose:instance': {
      if (!isSystem(event.token)) return power;
      const status: SystemStatus =
        event.type === 'construct:await'
          ? 'active'
          : event.type === 'construct'
            ? 'nominal'
            : event.type === 'construct:failed'
              ? 'alarm'
              : LIFETIME[event.token] === 'singleton'
                ? 'idle'
                : 'standby';
      return { systems: { ...power.systems, [event.token]: status } };
    }
    default:
      return power;
  }
}

/** The power after every event of a run. */
export function powerAfter(
  state: BayState,
  events: readonly TraceEvent[],
): Power {
  return events.reduce(applyEvent, darkPower(state));
}

/**
 * Whether a hull section is lit: it has singletons, and all of them are
 * nominal.
 */
function moduleLit(state: BayState, power: Power, module: ModuleName): boolean {
  const singletons = SYSTEM_IDS.filter(
    (id) =>
      MODULE_OF[id] === module &&
      state.systems[id] &&
      LIFETIME[id] === 'singleton',
  );
  return (
    singletons.length > 0 &&
    singletons.every((id) => power.systems[id] === 'nominal')
  );
}

/**
 * The rooms that hold power. A hull section lights its rooms when all its
 * singletons are nominal. A room that holds only transient or scoped systems
 * stays dark until they build, since core builds none of them at startup.
 */
export function poweredRooms(
  state: BayState,
  power: Power,
): ReadonlySet<string> {
  const lit = new Set<string>();
  for (const [module, rooms] of Object.entries(PLACEMENT.hullSections) as [
    ModuleName,
    readonly string[],
  ][]) {
    const on = moduleLit(state, power, module);
    for (const room of rooms) {
      const held = SYSTEM_IDS.filter(
        (id) => state.systems[id] && roomOfSystem(id) === room,
      );
      const onDemand =
        held.length > 0 && held.every((id) => LIFETIME[id] !== 'singleton');
      if (onDemand ? held.some((id) => power.systems[id] === 'nominal') : on)
        lit.add(room);
    }
  }
  return lit;
}

/** One line of the step list: a level and the systems that came online in it. */
export interface LevelLine {
  readonly level: number;
  readonly text: string;
}

const capitalise = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

const join = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * "Level N." lines from the build events of a run, numbered from the events'
 * `level` plus one since core counts from 0. A level that built no system the
 * bay knows prints no line.
 */
export function levelLines(events: readonly TraceEvent[]): LevelLine[] {
  const byLevel = new Map<number, string[]>();
  for (const event of events) {
    if (event.type !== 'construct' || event.level === null) continue;
    if (!isSystem(event.token)) continue;
    const names = byLevel.get(event.level) ?? [];
    names.push(SYSTEM_WORD[event.token]);
    byLevel.set(event.level, names);
  }
  return [...byLevel.entries()]
    .sort(([left], [right]) => left - right)
    .map(([level, names]) => ({
      level: level + 1,
      text: `Level ${level + 1}. ${capitalise(join(names))} online.`,
    }));
}
