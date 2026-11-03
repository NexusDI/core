import type { LoadOptions, ModuleRef, Nexus, Scope } from '@nexusdi/core';
import type { MapDefinition, MapId } from '@nexusdi/meridian-systems/maps';

import type { CameraTarget, DeckEvent, DeckPatch } from '../state/contracts.js';

/** A map file, or a function that loads it when a scope first asks for it. */
export type MapEntry = MapDefinition | (() => Promise<MapDefinition>);

/** What `DeckMaps.forRoot()` takes. */
export interface DeckMapsOptions {
  /** The maps the app can open, by id. */
  readonly maps: Readonly<Record<MapId, MapEntry>>;
  /**
   * The scene modules the app can load, by id. Each value is a dynamic import
   * of the module, so a map file can name a scene and carry no code.
   */
  readonly scenes?: Readonly<Record<string, () => Promise<ModuleRef>>>;
  /**
   * The ids of the ship's doors. A `set` effect on one of them holds the
   * door's state, and on any other id it holds the prop's frame. The app
   * passes them from the geometry, since this entry imports no run-time value
   * of meridian-systems.
   */
  readonly doors?: readonly string[];
}

/** The newest map schema this build reads. */
export const KNOWN_SCHEMA_VERSION = 1;

/** One thing a map asks the DOM layer to show or say. */
export type Cue =
  | {
      readonly kind: 'callout';
      readonly at: string;
      readonly show?: readonly string[];
      readonly text?: string;
    }
  | { readonly kind: 'announce'; readonly text: string };

/**
 * The scope's map, with the cues its triggers and scene hook raised. The DOM
 * layer reads the cues; the map's own `callouts` and `firstVisit` stay on
 * `map`.
 */
export interface IScene {
  readonly map: MapDefinition;
  /** What the scene runner pairs with the hooks of this map. */
  readonly binding: SceneBinding;
  /** Every cue raised since the scope opened, oldest first. */
  cues(): readonly Cue[];
  /** Calls the listener for each later cue. Returns the function that stops it. */
  onCue(listener: (cue: Cue) => void): () => void;
}

/** What a scene hook may do. It holds no Pixi type. */
export interface SceneContext {
  readonly map: MapDefinition;
  readonly state: {
    /** Holds a patch over the bindings under `id` until it is released or the scope closes. */
    hold(id: string, patch: DeckPatch): void;
    release(id: string): void;
    setCameraTarget(target: CameraTarget): void;
  };
  readonly camera: {
    /** Moves the camera to a room, door or fixture. */
    focus(id: string, zoom?: CameraTarget['zoom']): void;
  };
  callout(
    at: string,
    content: { readonly show: readonly string[] } | { readonly text: string },
  ): void;
  announce(text: string): void;
}

/** The code a scene module attaches to its map. */
export interface ISceneHook {
  onEnter?(context: SceneContext): void | Promise<void>;
  onEvent?(event: DeckEvent, context: SceneContext): void;
  onExit?(): void;
}

/** What a scope hands the runner so scene hooks can reach it. */
export interface SceneBinding {
  readonly context: SceneContext;
  readonly sceneId: string | null;
}

export interface ISceneRunner {
  /**
   * Attaches a hook to every open map whose `scene` is `sceneId`, and to each
   * one that opens later. Returns the function that detaches it.
   */
  attach(sceneId: string, hook: ISceneHook): () => void;
  /** Puts an open map in reach of the hooks. Returns the function that removes it. */
  register(binding: SceneBinding): () => void;
  /** Passes an event of the source to the hooks of one map. */
  dispatch(binding: SceneBinding, event: DeckEvent): void;
  /**
   * Loads the scene module the scope's map names with `options.imports`, then
   * extends the scope so it reads what the module provides. The imports
   * include the loaded `DeckMaps` module, since a hook reaches `SCENE_RUNNER`
   * through it. A map with no scene, or one the options do not list, loads
   * nothing. Resolves once every hook's `onEnter` has settled.
   */
  open(
    nexus: Nexus,
    scope: Scope,
    options: Pick<LoadOptions, 'imports'>,
  ): Promise<void>;
}

/** What the trigger engine asks of its host. */
export interface EngineHost {
  hold(trigger: string, patch: DeckPatch): void;
  release(trigger: string): void;
  setCameraTarget(target: CameraTarget): void;
  cue(cue: Cue): void;
  isDoor(id: string): boolean;
}
