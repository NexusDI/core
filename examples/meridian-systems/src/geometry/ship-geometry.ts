import geometry from '../../deck/meridian.geometry.json' with { type: 'json' };

/**
 * A closed interval `[min, max]` in metres. The JSON module types each pair
 * as `number[]`, so the type stays an array and the geometry test checks the
 * length.
 */
export type Span = readonly number[];

/** A point `[x, y, z]` in metres. */
export type Point = readonly number[];

/** An axis-aligned box in ship coordinates. */
export interface Box {
  readonly x: Span;
  readonly y: Span;
  readonly z: Span;
}

/**
 * One cross-section of the hull at `x`. The section is an octagon: a
 * rectangle `halfBeam` either side of the centreline from `bottom` to `top`,
 * with each corner cut by its chamfer `[dy, dz]`. The volume between two
 * stations joins their corners with straight lines.
 */
export interface HullStation {
  readonly x: number;
  readonly halfBeam: number;
  readonly bottom: number;
  readonly top: number;
  readonly chamferBottom: Span;
  readonly chamferTop: Span;
}

/**
 * One mass of the hull, such as the command section or the reactor block.
 * The hull is the union of its volumes, and the volumes overlap where they
 * join.
 */
export interface HullVolume {
  readonly id: string;
  readonly stations: readonly HullStation[];
}

export interface DeckBand {
  readonly id: string;
  /** Height of the floor above the ventral skin. */
  readonly floor: number;
  /** Floor to floor. */
  readonly height: number;
  /** Floor to ceiling, under the plenum where the conduits run. */
  readonly clearHeight: number;
}

export interface CompartmentShape {
  /** A compartment id of the deck plan. */
  readonly id: string;
  /** The hull section the room belongs to. */
  readonly hullSection: string;
  /** The colour group a drawing gives the room. */
  readonly role: string;
  readonly decks: readonly string[];
  /** False for the two bays, which hold vacuum. */
  readonly pressurised: boolean;
  /** The room's space, floor to floor. Most rooms are one box. */
  readonly boxes: readonly Box[];
  /** The room's large items, drawn in the cutaway and the deck plans. */
  readonly fixtures: readonly FixtureShape[];
}

/**
 * A blockout item inside a room, such as a console or the reactor vessel.
 * A `cylinder` stands upright in its box's footprint.
 */
export interface FixtureShape extends Box {
  readonly id: string;
  readonly kind: string;
  readonly shape: string;
}

/**
 * A door is a rectangle on the wall, floor or ceiling the two sides share.
 * One of its spans is a single value: the plane it sits in.
 */
export interface DoorShape extends Box {
  readonly id: string;
  /** Two compartment ids, or a compartment id and `space`. */
  readonly between: readonly string[];
  readonly kind: string;
}

export interface ConduitRoute {
  readonly id: string;
  /** What the conduit carries: `power`, `coolant` or `atmosphere`. */
  readonly kind: string;
  /** The `power.loads` entry a power conduit feeds. */
  readonly load?: string;
  /**
   * A polyline along the ceiling plenum. Each leg stays inside one
   * compartment, and only the first or last point may sit outside the
   * rooms, at an exterior part.
   */
  readonly path: readonly Point[];
}

export interface TankShape extends Box {
  readonly id: string;
  readonly contents: string;
}

/**
 * A light source the deck view lights a room with. Its box is the housing:
 * a lamp or strip under the ceiling, a flood in a bay, or the face of the
 * screen or core a `glow` comes from. The deck view draws a light sprite of
 * `radius` metres there, tinted with the art colour `colour` names. The deck
 * base paints the housings, and the emissive mask covers the housings of the
 * lights marked `emissive` while they are on.
 */
export interface LightShape extends Box {
  /** `<room id>.<name>`, unique among lights and fixtures. */
  readonly id: string;
  readonly room: string;
  /** One of the room's decks; the housing sits within its band. */
  readonly deck: string;
  /** `lamp`, `strip`, `flood` or `glow`. */
  readonly kind: string;
  /** The art colour of the sprite: `lamp` for room light, `glow` for a screen or core. */
  readonly colour: string;
  /** The reach of the light sprite in metres. */
  readonly radius: number;
  /** True for a lamp housing that glows in the emissive mask. */
  readonly emissive: boolean;
  /**
   * `on` and `off`. The deck state derives them: a lamp, strip or flood
   * follows its room's light, and a glow follows its fixture's state.
   */
  readonly states: readonly string[];
  /** For a `glow`: the fixture whose screen or core it comes from. */
  readonly fixture?: string;
}

/** A line parallel to the x axis. */
export interface Axis {
  readonly y: number;
  readonly z: number;
}

export interface Exterior {
  /** The bridge's recessed window strip, round the bow under the brow. */
  readonly windowStrip: { readonly x: Span; readonly z: Span };
  readonly railgun: {
    readonly axis: Axis;
    /** From the muzzle in the bow face to the breech in the capacitor room. */
    readonly x: Span;
    readonly boreRadius: number;
    readonly shroud: {
      readonly x: Span;
      readonly halfWidth: number;
      readonly top: number;
    };
    readonly breechHump: {
      readonly x: Span;
      readonly halfWidth: number;
      readonly top: number;
    };
  };
  /** A faired dorsal housing with the phased array flush in its canted face. */
  readonly commsHousing: {
    readonly x: Span;
    readonly y: Span;
    readonly height: number;
    readonly array: { readonly width: number; readonly height: number };
  };
  /** The survey sensors' dome on the command section's roof. */
  readonly sensorBlister: {
    readonly x: Span;
    readonly y: number;
    readonly radius: number;
  };
  /** The twin drive nacelles, each on a pylon from the drive section. */
  readonly nacelles: readonly {
    readonly id: string;
    readonly axis: Axis;
    readonly x: Span;
    readonly radius: number;
    readonly pylon: { readonly x: Span };
  }[];
  readonly radiators: {
    /** Fins along each nacelle, spread over `arcDeg` round its outboard side. */
    readonly nacelleVanes: {
      readonly x: Span;
      readonly count: number;
      readonly height: number;
      readonly arcDeg: Span;
    };
    /** Louvred panels in the reactor block's flanks. */
    readonly flankLouvres: { readonly x: Span; readonly z: Span };
  };
  readonly emitters: readonly {
    readonly id: string;
    readonly at: Point;
    readonly normal: Point;
  }[];
  readonly rcsQuads: readonly { readonly id: string; readonly at: Point }[];
  readonly engineBells: readonly {
    readonly id: string;
    readonly axis: Axis;
    readonly x: Span;
    readonly throatRadius: number;
    readonly exitRadius: number;
  }[];
  readonly markings: readonly {
    readonly text: string;
    /** `port`, `starboard`, `dorsal` or `ventral`. */
    readonly face: string;
    readonly x: Span;
    readonly y?: number;
    readonly z?: number;
  }[];
}

/** The shape of `deck/meridian.geometry.json`. */
export interface ShipGeometry {
  readonly units: string;
  readonly hull: {
    readonly length: number;
    readonly beam: number;
    readonly height: number;
    /** The least distance from a room to the outside of the hull. */
    readonly skin: number;
    readonly volumes: readonly HullVolume[];
  };
  readonly decks: readonly DeckBand[];
  readonly compartments: readonly CompartmentShape[];
  readonly doors: readonly DoorShape[];
  readonly conduits: readonly ConduitRoute[];
  readonly tanks: readonly TankShape[];
  readonly lights: readonly LightShape[];
  readonly exterior: Exterior;
}

/**
 * The Meridian's layout in metres: the hull, the decks, every compartment's
 * boxes, the doors and the conduit routes. The deck view, the cutaway and the
 * concept mesh in `tools/meridian-ship` all draw from this one plan. The x
 * axis runs aft from the bow, y to starboard and z up from the ventral skin.
 */
export const SHIP_GEOMETRY: ShipGeometry = geometry;
