/**
 * What the deck state holds and what feeds it. Nothing here imports Pixi, so
 * the page can load this entry with the rest of its client graph and draw the
 * lit view later, from `@nexusdi/meridian-deck/view`.
 */

/** A room's light: `powered`, `unpowered` (dark but for emissive parts), or `alarm`. */
export type RoomLight = 'powered' | 'unpowered' | 'alarm';

/** A fixture's glow: full when `online`, half while it `standby`s at startup, off when `offline`. */
export type FixtureLight = 'online' | 'standby' | 'offline';

/** How the changes in a patch arrive, in milliseconds. */
export interface Ramp {
  readonly delay: number;
  readonly duration: number;
}

/** The changes one event makes. A key not listed keeps its state. */
export interface DeckPatch {
  readonly rooms?: Readonly<Record<string, RoomLight>>;
  readonly fixtures?: Readonly<Record<string, FixtureLight>>;
  /** Absent: the options' `rampMs`. Under reduced motion every ramp is zero. */
  readonly ramp?: Ramp;
}

/** What a source tells the store. The store handles a type it does not know with its default branch. */
export interface DeckEvent {
  readonly type: 'state';
  readonly patch: DeckPatch;
}

/** The state of every room and fixture a source has set. */
export interface DeckSnapshot {
  readonly rooms: Readonly<Record<string, RoomLight>>;
  readonly fixtures: Readonly<Record<string, FixtureLight>>;
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

/** A class that reads an event type the store does not know and answers with a patch. */
export interface IDeckBinding {
  patchOf(event: DeckEvent): DeckPatch | undefined;
}

/** The store the views read. */
export interface IDeckState {
  snapshot(): DeckSnapshot;
  subscribe(listener: (change: DeckChange) => void): () => void;
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
  readonly room: string;
  readonly kind: string;
  /** The art colour's name, a key of the palette. */
  readonly colour: string;
  readonly fixture: string | null;
  readonly emissive: boolean;
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
