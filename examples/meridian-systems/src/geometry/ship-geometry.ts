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
 * with each corner cut by its chamfer `[dy, dz]`. The hull between two
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
  /** The hull section of section 16.3 of the ship systems spec. */
  readonly hullSection: string;
  /** The colour group a drawing gives the room. */
  readonly role: string;
  readonly decks: readonly string[];
  /** False for the two bays, which hold vacuum. */
  readonly pressurised: boolean;
  /** The room's space, floor to floor. Most rooms are one box. */
  readonly boxes: readonly Box[];
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
  /** `power`, `coolant` or `atmosphere`, the three kinds of section 16.4. */
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

/** A line parallel to the x axis. */
export interface Axis {
  readonly y: number;
  readonly z: number;
}

export interface Exterior {
  /** The bridge's armoured window band in the bow face. */
  readonly windowBand: Box;
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
  readonly masts: readonly {
    readonly id: string;
    readonly x: Span;
    readonly y: number;
    readonly base: number;
    readonly height: number;
    readonly array?: { readonly width: number; readonly height: number };
  }[];
  /** Deployed. Each wing is a flat panel from its root on the hull to its tip. */
  readonly radiatorWings: readonly {
    readonly side: string;
    readonly root: { readonly x: Span; readonly y: number };
    readonly tip: { readonly x: Span; readonly y: number };
    readonly z: number;
    readonly thickness: number;
    readonly sweepDeg: number;
  }[];
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
    readonly stations: readonly HullStation[];
  };
  readonly decks: readonly DeckBand[];
  readonly compartments: readonly CompartmentShape[];
  readonly doors: readonly DoorShape[];
  readonly conduits: readonly ConduitRoute[];
  readonly tanks: readonly TankShape[];
  readonly exterior: Exterior;
}

/**
 * The Meridian's layout in metres: the hull, the decks, every compartment's
 * boxes, the doors and the conduit routes. The deck view, the cutaway and the
 * concept mesh in `tools/meridian-ship` all draw from this one plan. The x
 * axis runs aft from the bow, y to starboard and z up from the ventral skin.
 */
export const SHIP_GEOMETRY: ShipGeometry = geometry;
