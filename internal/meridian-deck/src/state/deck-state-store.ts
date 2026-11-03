import { all } from '@nexusdi/core';

import type {
  CameraTarget,
  ConduitState,
  DeckAlarm,
  DeckChange,
  DeckEvent,
  DeckPatch,
  DeckSnapshot,
  DoorState,
  FixtureLight,
  IDeckBinding,
  IDeckSource,
  IDeckState,
  PropFrame,
  RoomLight,
} from './contracts.js';
import { inDevelopment } from './dev.js';
import { DECK_BINDINGS, DECK_SOURCE } from './tokens.js';

/** The channels of a patch that key their entries by id. */
const CHANNELS = ['rooms', 'fixtures', 'frames', 'doors', 'conduits'] as const;

/** The glow a frame implies. A frame not listed leaves the glow to the room. */
const GLOW_OF_FRAME: Partial<Record<PropFrame, FixtureLight>> = {
  on: 'online',
  off: 'offline',
  damaged: 'offline',
};

/** What a set of patches holds, channel by channel. */
interface Layer {
  rooms: Record<string, RoomLight>;
  fixtures: Record<string, FixtureLight>;
  frames: Record<string, PropFrame>;
  doors: Record<string, DoorState>;
  conduits: Record<string, ConduitState>;
  alarms: readonly DeckAlarm[] | undefined;
}

function emptyLayer(): Layer {
  return {
    rooms: {},
    fixtures: {},
    frames: {},
    doors: {},
    conduits: {},
    alarms: undefined,
  };
}

/** Gives every frame without a glow of its own the glow it implies. */
function withDerivedGlow(patch: DeckPatch): DeckPatch {
  if (patch.frames === undefined) return patch;
  let fixtures: Record<string, FixtureLight> | undefined;
  for (const [id, frame] of Object.entries(patch.frames)) {
    const glow = GLOW_OF_FRAME[frame];
    if (glow === undefined || patch.fixtures?.[id] !== undefined) continue;
    fixtures ??= { ...patch.fixtures };
    fixtures[id] = glow;
  }
  return fixtures === undefined ? patch : { ...patch, fixtures };
}

function merge(layer: Layer, patch: DeckPatch): void {
  Object.assign(layer.rooms, patch.rooms);
  Object.assign(layer.fixtures, patch.fixtures);
  Object.assign(layer.frames, patch.frames);
  Object.assign(layer.doors, patch.doors);
  Object.assign(layer.conduits, patch.conduits);
  if (patch.alarms !== undefined) layer.alarms = [...patch.alarms];
}

/**
 * Applies the patches of the source's events and tells its listeners. It
 * keeps the base state of the source and the bindings apart from the holds a
 * trigger lays over it, and it draws nothing: the views read it.
 */
export class DeckStateStore implements IDeckState, Disposable {
  static deps = [DECK_SOURCE, all(DECK_BINDINGS)] as const;

  private readonly base = emptyLayer();
  /** The hold of each trigger, oldest first. */
  private readonly holds = new Map<string, DeckPatch>();
  private camera: CameraTarget | undefined;
  private readonly listeners = new Set<(change: DeckChange) => void>();
  private stop: (() => void) | undefined;

  constructor(
    private readonly source: IDeckSource,
    private readonly bindings: readonly IDeckBinding[],
  ) {}

  onInit(): void {
    this.stop = this.source.subscribe((event) => this.receive(event));
  }

  snapshot(): DeckSnapshot {
    const layer = emptyLayer();
    merge(layer, this.base);
    const held: Record<string, string> = {};
    for (const [trigger, patch] of this.holds) {
      merge(layer, patch);
      for (const channel of CHANNELS) {
        for (const id of Object.keys(patch[channel] ?? {})) held[id] = trigger;
      }
    }
    return {
      rooms: layer.rooms,
      fixtures: layer.fixtures,
      frames: layer.frames,
      doors: layer.doors,
      conduits: layer.conduits,
      alarms: layer.alarms ?? [],
      held,
      camera: this.camera,
    };
  }

  subscribe(listener: (change: DeckChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hold(trigger: string, patch: DeckPatch): void {
    const effective = withDerivedGlow(patch);
    this.holds.delete(trigger);
    this.holds.set(trigger, effective);
    this.notify(effective);
  }

  release(trigger: string): void {
    if (this.holds.delete(trigger)) this.notify({});
  }

  releaseAll(): void {
    if (this.holds.size === 0) return;
    this.holds.clear();
    this.notify({});
  }

  heldBy(id: string): string | undefined {
    return this.snapshot().held[id];
  }

  setCameraTarget(target: CameraTarget): void {
    this.camera = { ...target };
    this.notify({});
  }

  /** Applies a patch as an event of the source would. */
  receive(event: DeckEvent): void {
    switch (event.type) {
      case 'state':
        this.apply([{ patch: event.patch }]);
        return;
      default: {
        // An event type this build does not know (P2): a binding may know it.
        // Every answer joins one change, so a view draws one frame for the event.
        const answers: { patch: DeckPatch; binding?: IDeckBinding }[] = [];
        for (const binding of this.bindings) {
          const patch = binding.patchOf(event);
          if (patch !== undefined) answers.push({ patch, binding });
        }
        if (answers.length > 0) this.apply(answers);
      }
    }
  }

  [Symbol.dispose](): void {
    this.stop?.();
    this.stop = undefined;
    this.listeners.clear();
  }

  private apply(answers: { patch: DeckPatch; binding?: IDeckBinding }[]): void {
    if (inDevelopment()) warnOnDoubleSet(answers);
    const combined: {
      -readonly [K in keyof DeckPatch]: DeckPatch[K];
    } = {};
    for (const { patch } of answers) {
      const effective = withDerivedGlow(patch);
      merge(this.base, effective);
      for (const channel of CHANNELS) {
        if (effective[channel] === undefined) continue;
        combined[channel] = {
          ...combined[channel],
          ...effective[channel],
        } as never;
      }
      if (effective.alarms !== undefined) combined.alarms = effective.alarms;
      if (effective.ramp !== undefined) combined.ramp = effective.ramp;
    }
    this.notify(combined);
  }

  private notify(patch: DeckPatch): void {
    const change = { patch, snapshot: this.snapshot() };
    for (const listener of [...this.listeners]) listener(change);
  }
}

/** Reports, in development, an id that two patches of one event set. */
function warnOnDoubleSet(
  answers: readonly { patch: DeckPatch; binding?: IDeckBinding }[],
): void {
  const setBy = new Map<string, string>();
  for (const { patch, binding } of answers) {
    const name = binding?.constructor.name ?? 'state';
    for (const channel of CHANNELS) {
      for (const id of Object.keys(patch[channel] ?? {})) {
        const key = `${channel}:${id}`;
        const first = setBy.get(key);
        if (first !== undefined) {
          console.warn(
            `Two bindings set ${channel} "${id}" for one event: ${first} and ${name}. The later one wins.`,
          );
        }
        setBy.set(key, name);
      }
    }
  }
}
