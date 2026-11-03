import type { MapDefinition, MapState } from '@nexusdi/meridian-systems/maps';

import type {
  CameraTarget,
  DeckAlarm,
  DeckPatch,
  IDeckSource,
  IDeckState,
} from '../state/contracts.js';
import { inDevelopment } from './dev.js';

import {
  KNOWN_SCHEMA_VERSION,
  type Cue,
  type DeckMapsOptions,
  type EngineHost,
  type IScene,
  type ISceneRunner,
  type SceneBinding,
  type SceneContext,
} from './contracts.js';
import { TriggerEngine } from './engine.js';

/**
 * The schema version a map's `$schema` names. A path or URL that ends in
 * `<n>.json` or `schema.v<n>.json` names `n`, and any other value names 1.
 */
export function schemaVersionOf(schema: string | undefined): number {
  const match = /(?:\/|schema\.v?)(\d+)\.json$/.exec(schema ?? '');
  return match === null ? 1 : Number(match[1]);
}

/** The patch a map's starting state holds. */
export function patchOfStart(start: MapState | undefined): DeckPatch {
  const patch: { -readonly [K in keyof DeckPatch]: DeckPatch[K] } = {};
  if (start?.fixtures !== undefined) patch.frames = { ...start.fixtures };
  if (start?.doors !== undefined) {
    patch.doors = Object.fromEntries(
      Object.entries(start.doors).map(([id, state]) => [id, { state }]),
    );
  }
  if (start?.rooms !== undefined) {
    const rooms: Record<string, 'powered' | 'unpowered' | 'alarm'> = {};
    const alarms: DeckAlarm[] = [];
    for (const [id, room] of Object.entries(start.rooms)) {
      const light =
        room.light ?? (room.alarm === undefined ? undefined : 'alarm');
      if (light !== undefined) rooms[id] = light;
      if (room.alarm !== undefined)
        alarms.push({ code: room.alarm, subject: id });
    }
    if (Object.keys(rooms).length > 0) patch.rooms = rooms;
    if (alarms.length > 0) patch.alarms = alarms;
  }
  return patch;
}

/**
 * One open map. On construction it holds the map's starting state, aims the
 * camera, runs the triggers over the source's events and the store's alarms,
 * and puts the map in reach of the scene hooks. On dispose it releases every
 * hold it made and leaves the hooks.
 */
export class MapScene implements IScene, Disposable {
  private readonly raised: Cue[] = [];
  private readonly listeners = new Set<(cue: Cue) => void>();
  private readonly keys = new Set<string>();
  private readonly stops: (() => void)[] = [];
  private readonly doors: ReadonlySet<string>;
  readonly binding: SceneBinding;

  constructor(
    readonly map: MapDefinition,
    private readonly state: IDeckState,
    private readonly source: IDeckSource,
    private readonly runner: ISceneRunner,
    options: DeckMapsOptions,
  ) {
    this.doors = new Set(options.doors);
    this.binding = { sceneId: map.scene, context: this.contextOf() };
    this.open();
  }

  /** Core runs `onInit` on singletons only, so a scoped scene sets up in its constructor. */
  private open(): void {
    const { map, state } = this;
    const patch = patchOfStart(map.start);
    if (Object.keys(patch).length > 0) this.hold(map.id, patch);
    state.setCameraTarget({
      deck: map.camera.deck,
      focus: map.camera.focus,
      zoom: map.camera.zoom,
    });

    const version = schemaVersionOf(map.$schema);
    const engine =
      version > KNOWN_SCHEMA_VERSION
        ? undefined
        : new TriggerEngine(map.triggers ?? [], this.engineHost());
    if (engine === undefined && inDevelopment()) {
      console.warn(
        `The map "${map.id}" uses schema version ${version}, and this build reads up to ${KNOWN_SCHEMA_VERSION}, so it shows with no triggers.`,
      );
    }

    if (engine !== undefined) {
      this.stops.push(this.runner.register(this.binding));
    }
    this.stops.push(
      this.source.subscribe((event) => {
        engine?.feed(event);
        this.runner.dispatch(this.binding, event);
      }),
    );
    this.stops.push(
      state.subscribe(({ snapshot }) => engine?.alarms(snapshot.alarms)),
    );
    engine?.enter();
    engine?.alarms(state.snapshot().alarms);
  }

  cues(): readonly Cue[] {
    return this.raised;
  }

  onCue(listener: (cue: Cue) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  [Symbol.dispose](): void {
    for (const stop of this.stops.splice(0).reverse()) stop();
    for (const key of this.keys) this.state.release(key);
    this.keys.clear();
    this.listeners.clear();
  }

  private hold(key: string, patch: DeckPatch): void {
    this.keys.add(key);
    this.state.hold(key, patch);
  }

  private release(key: string): void {
    this.keys.delete(key);
    this.state.release(key);
  }

  private cue(cue: Cue): void {
    this.raised.push(cue);
    for (const listener of [...this.listeners]) listener(cue);
  }

  private engineHost(): EngineHost {
    const prefix = `${this.map.id}:`;
    return {
      hold: (trigger, patch) => this.hold(prefix + trigger, patch),
      release: (trigger) => this.release(prefix + trigger),
      setCameraTarget: (target) => this.state.setCameraTarget(target),
      cue: (cue) => this.cue(cue),
      isDoor: (id) => this.doors.has(id),
    };
  }

  private contextOf(): SceneContext {
    const prefix = `${this.map.id}:scene:`;
    const camera = (target: CameraTarget) => this.state.setCameraTarget(target);
    return {
      map: this.map,
      state: {
        hold: (id, patch) => this.hold(prefix + id, patch),
        release: (id) => this.release(prefix + id),
        setCameraTarget: camera,
      },
      camera: {
        focus: (id, zoom) =>
          camera({ focus: id, ...(zoom === undefined ? {} : { zoom }) }),
      },
      callout: (at, content) => this.cue({ kind: 'callout', at, ...content }),
      announce: (text) => this.cue({ kind: 'announce', text }),
    };
  }
}
