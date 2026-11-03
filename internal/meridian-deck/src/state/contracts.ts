/**
 * What the deck state holds and what feeds it. Nothing here imports Pixi, so
 * the page can load this entry with the rest of its client graph and draw the
 * lit view later, from `@nexusdi/meridian-deck/view`.
 */

/** A room's light: `powered`, `unpowered` (dark but for emissive parts), or `alarm`. */
export type RoomLight = 'powered' | 'unpowered' | 'alarm';

/** A fixture's glow: full when `online`, half while it `standby`s at startup, off when `offline`. */
export type FixtureLight = 'online' | 'standby' | 'offline';

/**
 * One frame of a prop sprite. The union lists the same members as the
 * geometry's `PropState`, and a test keeps the two lists equal. It is declared
 * here so this entry needs no package of the ship geometry.
 */
export type PropFrame =
  'on' | 'off' | 'damaged' | 'open' | 'closed' | 'default';

/** A door's state and, when something forced it, the code of the cause. */
export interface DoorState {
  readonly state: 'open' | 'closed';
  readonly cause?: string;
}

/** A conduit's state and how full it runs, from 0 to 1. */
export interface ConduitState {
  readonly state: 'flowing' | 'shed' | 'broken';
  readonly level: number;
}

/**
 * An alarm on a subject. `code` is a plain string, so a code this build does
 * not know raises the alarm and lights nothing.
 */
export interface DeckAlarm {
  readonly code: string;
  readonly subject: string;
}

/** Where the map view looks. A field left out keeps the view's own choice. */
export interface CameraTarget {
  readonly deck?: string;
  readonly focus?: string;
  readonly zoom?: string | number;
}

/** How the changes in a patch arrive, in milliseconds. */
export interface Ramp {
  readonly delay: number;
  readonly duration: number;
}

/**
 * The changes one event makes. A key not listed keeps its state, except
 * `alarms`: a patch that lists alarms replaces the whole list, so a source
 * sends the alarms of a frame in full and an empty list clears them.
 *
 * `fixtures` is the glow channel and `frames` picks the sprite. A patch that
 * sets a frame and no glow for an id gets one from the store: `on` gives
 * `online`, `off` and `damaged` give `offline`, and `open`, `closed` and
 * `default` leave the glow to the room.
 */
export interface DeckPatch {
  readonly rooms?: Readonly<Record<string, RoomLight>>;
  readonly fixtures?: Readonly<Record<string, FixtureLight>>;
  readonly frames?: Readonly<Record<string, PropFrame>>;
  readonly doors?: Readonly<Record<string, DoorState>>;
  readonly conduits?: Readonly<Record<string, ConduitState>>;
  readonly alarms?: readonly DeckAlarm[];
  /** Absent: the options' `rampMs`. Under reduced motion every ramp is zero. */
  readonly ramp?: Ramp;
}

/**
 * The events a source can send, by type. A package that owns another event
 * adds it by augmenting this interface, so the set is open (extension
 * principle P2):
 *
 * ```ts
 * declare module '@nexusdi/meridian-deck' {
 *   interface DeckEventMap {
 *     drill: { readonly room: string };
 *   }
 * }
 * ```
 */
export interface DeckEventMap {
  state: { readonly patch: DeckPatch };
}

/** What a source tells the store. The store handles a type it does not know with its default branch. */
export type DeckEvent = {
  [Type in keyof DeckEventMap]: { readonly type: Type } & DeckEventMap[Type];
}[keyof DeckEventMap];

/**
 * The state of everything a source has set, with the holds laid over it. The
 * later hold wins on an id two holds set.
 */
export interface DeckSnapshot {
  readonly rooms: Readonly<Record<string, RoomLight>>;
  readonly fixtures: Readonly<Record<string, FixtureLight>>;
  readonly frames: Readonly<Record<string, PropFrame>>;
  readonly doors: Readonly<Record<string, DoorState>>;
  readonly conduits: Readonly<Record<string, ConduitState>>;
  readonly alarms: readonly DeckAlarm[];
  /** The trigger that holds each id, for an id a hold sets. */
  readonly held: Readonly<Record<string, string>>;
  readonly camera: CameraTarget | undefined;
}

/** A patch and the snapshot it produced. */
export interface DeckChange {
  readonly patch: DeckPatch;
  readonly snapshot: DeckSnapshot;
}

/**
 * Turns what a surface knows into events. A source hands a new listener its
 * current state at once, as an event, so a view that attaches late starts
 * from the ship as it is.
 */
export interface IDeckSource {
  subscribe(listener: (event: DeckEvent) => void): () => void;
}

/** A readout a binding offers: its name, its label and its unit. */
export interface ReadoutDefinition {
  readonly name: string;
  readonly label: string;
  readonly unit?: string;
}

/** A class that reads an event type the store does not know and answers with a patch. */
export interface IDeckBinding {
  patchOf(event: DeckEvent): DeckPatch | undefined;
  readonly readouts?: readonly ReadoutDefinition[];
}

/** The store the views read. */
export interface IDeckState {
  snapshot(): DeckSnapshot;
  subscribe(listener: (change: DeckChange) => void): () => void;
  /**
   * Lays a patch over the base state for as long as the trigger holds it. A
   * second `hold` by the same trigger replaces its patch and makes it the
   * latest hold.
   */
  hold(trigger: string, patch: DeckPatch): void;
  /** Drops the hold of one trigger. A trigger with no hold changes nothing. */
  release(trigger: string): void;
  releaseAll(): void;
  /** The trigger whose hold currently decides the id, if any. */
  heldBy(id: string): string | undefined;
  /** Replaces the camera target. The map view follows it. */
  setCameraTarget(target: CameraTarget): void;
}

/** The art colours of the light, as `#rrggbb`. The app passes its tokens (`lamp`, `glow`, `alarm`). */
export interface DeckPalette {
  readonly lamp: string;
  readonly glow: string;
  readonly alarm: string;
}

/** One light of `meridian-cutaway-lights.json`, in pixels of the cutaway frame. */
export interface DeckLight {
  readonly ids: readonly string[];
  /** The room whose rectangle holds the light, and whose index clips it. */
  readonly room: string;
  readonly kind: string;
  /** The art colour's name, a key of the palette. */
  readonly colour: string;
  readonly fixture: string | null;
  readonly emissive: boolean;
  /** The share of its level that the light's sprite shows. */
  readonly gain: number;
  /** The share of its level that the light's housing shows: 0.75, or 0.45 for a long strip. */
  readonly housing: number;
  readonly centre: readonly [number, number];
  readonly radius: number;
  readonly box: readonly [number, number, number, number];
}

/** `meridian-cutaway-rooms.legend.json`: the index of each room in the room mask and its bounds. */
export interface DeckLegend {
  readonly size: { readonly width: number; readonly height: number };
  readonly rooms: Readonly<Record<string, number>>;
  readonly bounds: Readonly<
    Record<string, readonly [number, number, number, number]>
  >;
}

/** An image the app has already decoded, so the view uploads it and never fetches it again. */
export type DeckImage = HTMLImageElement | ImageBitmap;

/** The unlit cutaway and the data layers that light it. */
export interface DeckScene {
  readonly base: DeckImage;
  /** URLs of the two mask PNGs (8-bit grey), which the view loads itself. */
  readonly masks: { readonly rooms: string; readonly emissive: string };
  readonly legend: DeckLegend;
  readonly lights: readonly DeckLight[];
}

/** What `DeckState.forRoot()` takes. */
export interface DeckOptions {
  readonly reducedMotion: boolean;
  readonly palette: DeckPalette;
  readonly scene: DeckScene;
  /** The ramp of a change whose patch names none, in milliseconds. Defaults to 160. */
  readonly rampMs?: number;
}
