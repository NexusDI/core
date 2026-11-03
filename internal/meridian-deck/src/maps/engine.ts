import type {
  MapCondition,
  MapEffect,
  MapTrigger,
} from '@nexusdi/meridian-systems/maps';

import type { DeckAlarm, DeckEvent, DeckPatch } from '../state/contracts.js';
import { inDevelopment } from './dev.js';

import type { EngineHost } from './contracts.js';
import './events.js';

/** The event type a level condition reads, or `alarm` for the store's alarm list. */
type Family = 'reading' | 'graph' | 'objective' | 'passed' | 'alarm';

/** A condition that holds for as long as a fact does, so it fires once per crossing. */
interface Level {
  readonly family: Family;
  readonly holds: (facts: Facts) => boolean;
}

/** A condition that holds for one event. */
interface Pulse {
  readonly matches: (event: DeckEvent) => boolean;
}

type Compiled =
  | { readonly kind: 'enter' }
  | ({ readonly kind: 'pulse' } & Pulse)
  | ({ readonly kind: 'level' } & Level);

interface Facts {
  reading: object | undefined;
  modules: readonly string[];
  providers: Readonly<Record<string, readonly string[]>>;
  objectives: Map<string, 'pass' | 'fail'>;
  missions: readonly string[];
  alarms: readonly DeckAlarm[];
}

interface Armed {
  readonly trigger: MapTrigger;
  readonly condition: Compiled;
  readonly effects: readonly MapEffect[];
  /** Whether a level condition held at the last fact that could change it. */
  active: boolean;
}

function warn(message: string): void {
  if (inDevelopment()) console.warn(message);
}

/** The value at a dotted path of a nested record, or undefined. */
function valueAt(reading: object, path: string) {
  let value: unknown = reading;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function compile(condition: MapCondition): Compiled | undefined {
  const c = condition as Record<string, unknown>;
  if (c['enter'] === true) return { kind: 'enter' };
  if (typeof c['select'] === 'string') {
    const id = c['select'];
    return {
      kind: 'pulse',
      matches: (event) => event.type === 'select' && event.id === id,
    };
  }
  if (typeof c['record'] === 'string') {
    const path = c['record'];
    const holds = (facts: Facts): boolean => {
      if (facts.reading === undefined) return false;
      const value = valueAt(facts.reading, path);
      if ('is' in c) return value === c['is'];
      if (typeof value !== 'number') return false;
      if (typeof c['above'] === 'number') return value > c['above'];
      if (typeof c['below'] === 'number') return value < c['below'];
      return false;
    };
    if (
      !('is' in c) &&
      typeof c['above'] !== 'number' &&
      typeof c['below'] !== 'number'
    ) {
      return undefined;
    }
    return { kind: 'level', family: 'reading', holds };
  }
  if (typeof c['alarm'] === 'string' && typeof c['room'] === 'string') {
    const { alarm, room } = c as { alarm: string; room: string };
    return {
      kind: 'level',
      family: 'alarm',
      holds: (facts) =>
        facts.alarms.some((a) => a.code === alarm && a.subject === room),
    };
  }
  if (typeof c['refused'] === 'string') {
    const code = c['refused'];
    const narrow = ['door', 'room', 'system'] as const;
    return {
      kind: 'pulse',
      matches: (event) =>
        event.type === 'answer' &&
        event.refused === code &&
        narrow.every((key) => c[key] === undefined || event[key] === c[key]),
    };
  }
  if (typeof c['provider'] === 'string' && typeof c['event'] === 'string') {
    const { provider, event } = c as { provider: string; event: string };
    return {
      kind: 'level',
      family: 'graph',
      holds: (facts) => facts.providers[provider]?.includes(event) ?? false,
    };
  }
  if (typeof c['objective'] === 'string' && typeof c['status'] === 'string') {
    const { objective, status } = c as { objective: string; status: string };
    return {
      kind: 'level',
      family: 'objective',
      holds: (facts) => facts.objectives.get(objective) === status,
    };
  }
  if (typeof c['loaded'] === 'string') {
    const name = c['loaded'];
    return {
      kind: 'level',
      family: 'graph',
      holds: (facts) => facts.modules.includes(name),
    };
  }
  if (typeof c['passed'] === 'string') {
    const mission = c['passed'];
    return {
      kind: 'level',
      family: 'passed',
      holds: (facts) => facts.missions.includes(mission),
    };
  }
  return undefined;
}

const KNOWN_EFFECTS = [
  'set',
  'room',
  'conduit',
  'camera',
  'callout',
  'announce',
  'release',
] as const;

/** The level a held conduit state draws at. */
const CONDUIT_LEVEL = { flowing: 1, shed: 0, broken: 0 } as const;

/**
 * Runs a map's triggers. It reads the events of the deck source and the
 * store's alarms, fires a trigger's effects through the host, and fires a
 * level condition once per crossing: it fires again only after the fact
 * stopped holding and held again.
 */
export class TriggerEngine {
  private readonly armed: Armed[] = [];
  private readonly facts: Facts = {
    reading: undefined,
    modules: [],
    providers: {},
    objectives: new Map(),
    missions: [],
    alarms: [],
  };

  constructor(
    triggers: readonly MapTrigger[],
    private readonly host: EngineHost,
  ) {
    for (const trigger of triggers) {
      const condition = compile(trigger.when);
      if (condition === undefined) {
        warn(
          `Trigger "${trigger.id}" has a condition this build does not know, so it never fires: ${JSON.stringify(trigger.when)}`,
        );
        continue;
      }
      const effects = trigger.then.filter((effect) => {
        const known = KNOWN_EFFECTS.some(
          (key) => typeof (effect as Record<string, unknown>)[key] === 'string',
        );
        if (!known) {
          warn(
            `Trigger "${trigger.id}" has an effect this build does not know, so it is skipped: ${JSON.stringify(effect)}`,
          );
        }
        return known;
      });
      this.armed.push({ trigger, condition, effects, active: false });
    }
  }

  /** Fires the triggers that wait for the scope to open. */
  enter(): void {
    for (const armed of this.armed) {
      if (armed.condition.kind === 'enter') this.fire(armed);
    }
  }

  /** Reads one event of the source. */
  feed(event: DeckEvent): void {
    switch (event.type) {
      case 'reading':
        this.facts.reading = event.reading;
        this.evaluate('reading');
        return;
      case 'graph':
        this.facts.modules = event.modules;
        this.facts.providers = event.providers;
        this.evaluate('graph');
        return;
      case 'objective':
        this.facts.objectives.set(event.objective, event.status);
        this.evaluate('objective');
        return;
      case 'passed':
        this.facts.missions = event.missions;
        this.evaluate('passed');
        return;
      default:
        for (const armed of this.armed) {
          if (
            armed.condition.kind === 'pulse' &&
            armed.condition.matches(event)
          ) {
            this.fire(armed);
          }
        }
    }
  }

  /** Reads the store's alarm list. */
  alarms(alarms: readonly DeckAlarm[]): void {
    this.facts.alarms = alarms;
    this.evaluate('alarm');
  }

  private evaluate(family: Family): void {
    for (const armed of this.armed) {
      const { condition } = armed;
      if (condition.kind !== 'level' || condition.family !== family) continue;
      const holds = condition.holds(this.facts);
      const crossed = holds && !armed.active;
      // The flag moves before the effects run, so an effect that changes the
      // store and brings the alarms back here does not fire the trigger twice.
      armed.active = holds;
      if (crossed) this.fire(armed);
    }
  }

  private fire({ trigger, effects }: Armed): void {
    let pending: { -readonly [K in keyof DeckPatch]: DeckPatch[K] } = {};
    const flush = (): void => {
      if (Object.keys(pending).length === 0) return;
      this.host.hold(trigger.id, pending);
      pending = {};
    };
    for (const effect of effects) {
      const e = effect as Record<string, unknown>;
      if (typeof e['set'] === 'string') {
        const id = e['set'];
        const state = e['state'] as 'open' | 'closed';
        if (this.host.isDoor(id)) {
          if (state === 'open' || state === 'closed') {
            pending.doors = { ...pending.doors, [id]: { state } };
          } else {
            warn(
              `Trigger "${trigger.id}" sets door "${id}" to "${String(state)}", which a door does not have.`,
            );
          }
        } else {
          pending.frames = { ...pending.frames, [id]: state };
        }
      } else if (typeof e['room'] === 'string') {
        pending.rooms = {
          ...pending.rooms,
          [e['room']]: e['light'] as 'powered',
        };
      } else if (typeof e['conduit'] === 'string') {
        const state = e['state'] as keyof typeof CONDUIT_LEVEL;
        pending.conduits = {
          ...pending.conduits,
          [e['conduit']]: { state, level: CONDUIT_LEVEL[state] },
        };
      } else if (typeof e['camera'] === 'string') {
        flush();
        this.host.setCameraTarget({
          focus: e['camera'],
          ...(e['zoom'] === undefined
            ? {}
            : { zoom: e['zoom'] as string | number }),
        });
      } else if (typeof e['callout'] === 'string') {
        this.host.cue({
          kind: 'callout',
          at: e['callout'],
          ...(Array.isArray(e['show']) ? { show: e['show'] as string[] } : {}),
          ...(typeof e['text'] === 'string' ? { text: e['text'] } : {}),
        });
      } else if (typeof e['announce'] === 'string') {
        this.host.cue({ kind: 'announce', text: e['announce'] });
      } else if (typeof e['release'] === 'string') {
        flush();
        this.host.release(e['release']);
      }
    }
    flush();
  }
}
