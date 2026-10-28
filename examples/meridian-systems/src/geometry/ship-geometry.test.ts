import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { COMPARTMENT_IDS } from '../simulation/contracts';
import {
  SHIP_GEOMETRY,
  type Box,
  type CompartmentShape,
  type DoorShape,
  type HullStation,
  type Point,
} from './ship-geometry';

const { hull, decks, compartments, doors, conduits, tanks, exterior } =
  SHIP_GEOMETRY;

/** Section 16.2's compartments, the four existing ids first, then fore to aft. */
const SPEC_COMPARTMENTS = [
  'bridge',
  'habitat',
  'reactor-bay',
  'airlock',
  'chart-room',
  'computer-core',
  'quarters',
  'comms-relay',
  'shuttle-bay',
  'drone-bay',
  'capacitor-room',
  'engineering',
  'ftl-core',
  'main-drive',
];

/** Section 16.2's doors, in deck order. */
const SPEC_DOORS = [
  'bridge-habitat',
  'habitat-airlock',
  'airlock-outer',
  'bridge-chart-room',
  'bridge-computer-core',
  'habitat-quarters',
  'habitat-comms-relay',
  'airlock-shuttle-bay',
  'shuttle-bay-outer',
  'shuttle-bay-drone-bay',
  'drone-bay-outer',
  'habitat-engineering',
  'engineering-capacitor-room',
  'engineering-ftl-core',
  'engineering-reactor-bay',
  'reactor-bay-main-drive',
];

const AXES = ['x', 'y', 'z'] as const;
const EPS = 1e-9;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A volume's octagon at `x`, as (y, z) corners counter-clockwise from the port keel corner. */
function section(
  stations: readonly HullStation[],
  x: number,
): (readonly [number, number])[] {
  const i = stations.findIndex((s, k) => k > 0 && x <= s.x);
  if (x < stations[0].x || i < 0) return [];
  const a = stations[i - 1];
  const b = stations[i];
  const t = (x - a.x) / (b.x - a.x);
  const at = (pick: (s: HullStation) => number) => lerp(pick(a), pick(b), t);
  const w = at((s) => s.halfBeam);
  const bottom = at((s) => s.bottom);
  const top = at((s) => s.top);
  const [bdy, bdz] = [
    at((s) => s.chamferBottom[0]),
    at((s) => s.chamferBottom[1]),
  ];
  const [tdy, tdz] = [at((s) => s.chamferTop[0]), at((s) => s.chamferTop[1])];
  return [
    [-w + bdy, bottom],
    [w - bdy, bottom],
    [w, bottom + bdz],
    [w, top - tdz],
    [w - tdy, top],
    [-w + tdy, top],
    [-w, top - tdz],
    [-w, bottom + bdz],
  ];
}

/** The distance from (y, z) to the outside of one convex section; negative outside. */
function sectionDepth(
  corners: readonly (readonly [number, number])[],
  y: number,
  z: number,
): number {
  if (corners.length === 0) return -Infinity;
  let least = Infinity;
  for (let k = 0; k < corners.length; k++) {
    const [y0, z0] = corners[k];
    const [y1, z1] = corners[(k + 1) % corners.length];
    const len = Math.hypot(y1 - y0, z1 - z0);
    // The inward normal of a counter-clockwise edge.
    const d = ((y1 - y0) * (z - z0) - (z1 - z0) * (y - y0)) / len;
    least = Math.min(least, d);
  }
  return least;
}

/** The depth of a point in the hull, the union of its volumes; negative outside. */
const depth = (x: number, y: number, z: number) =>
  Math.max(
    ...hull.volumes.map((v) => sectionDepth(section(v.stations, x), y, z)),
  );

/**
 * The corners of a box and points every 0.5 m along its x edges, so a box
 * that spans two volumes cannot leave the hull between its corners.
 */
function corners(box: Box): Point[] {
  const out: Point[] = [];
  const steps = Math.ceil((box.x[1] - box.x[0]) / 0.5);
  for (let k = 0; k <= steps; k++) {
    const x = lerp(box.x[0], box.x[1], k / steps);
    for (const y of box.y) for (const z of box.z) out.push([x, y, z]);
  }
  return out;
}

const stations = hull.volumes.flatMap((v) => v.stations);

const contains = (box: Box, p: Point) =>
  AXES.every(
    (axis, k) => box[axis][0] - EPS <= p[k] && p[k] <= box[axis][1] + EPS,
  );

const overlapVolume = (a: Box, b: Box) =>
  AXES.reduce(
    (v, axis) =>
      v *
      Math.max(
        0,
        Math.min(a[axis][1], b[axis][1]) - Math.max(a[axis][0], b[axis][0]),
      ),
    1,
  );

const boxesOf = (id: string) =>
  compartments.find((c) => c.id === id)?.boxes ?? [];

const flatAxis = (door: DoorShape) =>
  AXES.find((axis) => door[axis][0] === door[axis][1])!;

/**
 * The space a fixture must leave free at a door: 1.0 m either side of a wall
 * door, and the hatch's footprint with a 0.2 m margin through the decks above
 * and below a floor hatch.
 */
function doorZone(door: DoorShape): Box {
  const flat = flatAxis(door);
  const at = door[flat][0];
  if (flat === 'z')
    return {
      x: [door.x[0] - 0.2, door.x[1] + 0.2],
      y: [door.y[0] - 0.2, door.y[1] + 0.2],
      z: [at - 3.2, at + 3.2],
    };
  return { ...door, [flat]: [at - 1.0, at + 1.0] } as Box;
}

const snap = (v: number) => Math.round(v * 10) / 10;

/** Where a crew member stands to use a door: 0.6 m inside a wall door, under or over a hatch. */
function accessPoint(room: CompartmentShape, door: DoorShape) {
  const flat = flatAxis(door);
  const centre = AXES.map((axis) => (door[axis][0] + door[axis][1]) / 2);
  if (flat === 'z') {
    const at = door.z[0];
    const box =
      room.boxes.find((b) => Math.abs(b.z[0] - at) < EPS) ??
      room.boxes.find((b) => Math.abs(b.z[1] - at) < EPS)!;
    return { x: centre[0], y: centre[1], floor: box.z[0] };
  }
  const k = AXES.indexOf(flat);
  const step = (d: number) => centre.map((v, j) => (j === k ? v + d : v));
  const sign = room.boxes.some((b) => contains(b, step(0.1))) ? 1 : -1;
  const p = step(sign * 0.6);
  // A bay's floor lies below the sill of its raised hatch.
  const box = room.boxes.find((b) => contains(b, p))!;
  return { x: p[0], y: p[1], floor: box.z[0] };
}

/** True when the room's floor is free at (x, y): inside the room and under no fixture. */
function freeAt(room: CompartmentShape, floor: number, x: number, y: number) {
  const p: Point = [x, y, floor + 0.05];
  if (!room.boxes.some((b) => contains(b, p))) return false;
  return !room.fixtures.some(
    (f) =>
      f.x[0] < x &&
      x < f.x[1] &&
      f.y[0] < y &&
      y < f.y[1] &&
      f.z[0] < floor + 2.0 &&
      floor < f.z[1],
  );
}

/** True when a 1.0 m square of free floor is centred on (x, y). */
function wideAt(room: CompartmentShape, floor: number, x: number, y: number) {
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      if (!freeAt(room, floor, x + i * 0.25, y + j * 0.25)) return false;
  return true;
}

const inRooms = (p: Point) =>
  compartments
    .filter((c) => c.boxes.some((box) => contains(box, p)))
    .map((c) => c.id);

describe('the ship geometry', () => {
  it("lists section 16.2's fourteen compartments, the deck plan's ids first", () => {
    const ids = compartments.map((c) => c.id);
    expect(ids).toEqual(SPEC_COMPARTMENTS);
    expect(ids.slice(0, COMPARTMENT_IDS.length)).toEqual([...COMPARTMENT_IDS]);
    for (const room of deck.compartments) expect(ids).toContain(room.id);
  });

  it('marks the two bays alone as unpressurised', () => {
    expect(compartments.filter((c) => !c.pressurised).map((c) => c.id)).toEqual(
      ['shuttle-bay', 'drone-bay'],
    );
  });

  it('gives every span two values in order and every point three', () => {
    const boxes: Box[] = [
      ...compartments.flatMap((c) => c.boxes),
      ...doors,
      ...tanks,
    ];
    for (const box of boxes)
      for (const axis of AXES) {
        expect(box[axis]).toHaveLength(2);
        expect(box[axis][0]).toBeLessThanOrEqual(box[axis][1]);
      }
    for (const conduit of conduits)
      for (const p of conduit.path) expect(p).toHaveLength(3);
  });

  it('keeps the hull at 72 m by 16 m by 13 m, with the bells at the stern', () => {
    expect(Math.max(...stations.map((s) => s.halfBeam)) * 2).toBe(hull.beam);
    expect(Math.min(...stations.map((s) => s.bottom))).toBe(0);
    expect(Math.min(...stations.map((s) => s.x))).toBe(0);
    expect(exterior.railgun.breechHump.top).toBe(hull.height);
    for (const bell of exterior.engineBells)
      expect(bell.x[1]).toBe(hull.length);
    for (const s of stations) {
      expect(s.top, `station at ${s.x}`).toBeLessThanOrEqual(hull.height);
      expect(s.x, `station at ${s.x}`).toBeLessThanOrEqual(hull.length);
    }
    for (const n of exterior.nacelles) {
      expect(n.x[1], n.id).toBeLessThanOrEqual(hull.length);
      expect(n.pylon.x[1], n.id).toBeLessThanOrEqual(hull.length);
    }
  });

  it('puts the two drive nacelles and their bells symmetric about the long axis', () => {
    const [port, starboard] = exterior.nacelles;
    expect(port.axis.y).toBe(-starboard.axis.y);
    expect(port.axis.z).toBe(starboard.axis.z);
    for (const bell of exterior.engineBells) {
      const nacelle = exterior.nacelles.find((n) => n.axis.y === bell.axis.y);
      expect(nacelle?.axis.z, bell.id).toBe(bell.axis.z);
      expect(bell.exitRadius, bell.id).toBeLessThanOrEqual(nacelle!.radius);
    }
  });

  it('stacks three 3.2 m decks', () => {
    expect(decks.map((d) => [d.id, d.floor, d.height])).toEqual([
      ['lower', 1.6, 3.2],
      ['main', 4.8, 3.2],
      ['upper', 8.0, 3.2],
    ]);
  });

  it('fits each box to its decks, a bay dropping into the keel', () => {
    for (const room of compartments) {
      const bands = decks.filter((d) => room.decks.includes(d.id));
      const floor = Math.min(...bands.map((d) => d.floor));
      const ceiling = Math.max(...bands.map((d) => d.floor + d.height));
      for (const box of room.boxes) {
        expect(box.z[1], room.id).toBeCloseTo(ceiling, 9);
        if (room.pressurised) expect(box.z[0], room.id).toBeCloseTo(floor, 9);
        else expect(box.z[0], room.id).toBeLessThanOrEqual(floor);
      }
    }
  });

  it('keeps every room and tank inside the hull, behind the skin', () => {
    const boxes = [
      ...compartments.flatMap((c) =>
        c.boxes.map((box) => [c.id, box] as const),
      ),
      ...tanks.map((t) => [t.id, t] as const),
    ];
    for (const [id, box] of boxes)
      for (const [x, y, z] of corners(box))
        expect(
          depth(x, y, z),
          `${id} at ${x}, ${y}, ${z}`,
        ).toBeGreaterThanOrEqual(hull.skin - EPS);
  });

  it('lets no two boxes overlap', () => {
    const boxes = [
      ...compartments.flatMap((c) =>
        c.boxes.map((box) => [c.id, box] as const),
      ),
      ...tanks.map((t) => [t.id, t] as const),
    ];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(
          overlapVolume(boxes[i][1], boxes[j][1]),
          `${boxes[i][0]} and ${boxes[j][0]}`,
        ).toBe(0);
  });

  it("lists section 16.2's sixteen doors", () => {
    expect(doors.map((d) => d.id)).toEqual(SPEC_DOORS);
  });

  it('sizes each hatch at 1.5 m by 2.0 m and the bay doors at 10 m by 5 m and 3 m by 2 m', () => {
    const size = (d: Box) =>
      AXES.map((axis) => d[axis][1] - d[axis][0])
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
    for (const door of doors.filter((d) => d.kind === 'hatch'))
      expect(size(door), door.id).toEqual([1.5, 2]);
    expect(size(doors.find((d) => d.id === 'shuttle-bay-outer')!)).toEqual([
      5, 10,
    ]);
    expect(size(doors.find((d) => d.id === 'drone-bay-outer')!)).toEqual([
      2, 3,
    ]);
  });

  it('puts every door on a wall, floor or ceiling both its sides share', () => {
    for (const door of doors) {
      const flat = AXES.filter((axis) => door[axis][0] === door[axis][1]);
      expect(flat, door.id).toHaveLength(1);
      const plane = flat[0];
      const at = door[plane][0];
      const onFace = (box: Box) =>
        (Math.abs(box[plane][0] - at) < EPS ||
          Math.abs(box[plane][1] - at) < EPS) &&
        AXES.filter((axis) => axis !== plane).every(
          (axis) =>
            box[axis][0] - EPS <= door[axis][0] &&
            door[axis][1] <= box[axis][1] + EPS,
        );
      for (const side of door.between.filter((s) => s !== 'space'))
        expect(boxesOf(side).some(onFace), `${door.id} on ${side}`).toBe(true);
      const rooms = door.between.filter((s) => s !== 'space');
      if (rooms.length === 2) {
        // The two sides lie on opposite sides of the plane.
        const centre = AXES.map((axis) => (door[axis][0] + door[axis][1]) / 2);
        const k = AXES.indexOf(plane);
        const step = (d: number) => centre.map((v, j) => (j === k ? v + d : v));
        const before = inRooms(step(-0.1));
        const after = inRooms(step(0.1));
        expect([before, after].flat().sort(), door.id).toEqual(
          [...rooms].sort(),
        );
      }
    }
  });

  it('opens each door to space through the hull skin', () => {
    for (const door of doors.filter((d) => d.between.includes('space'))) {
      const plane = AXES.find((axis) => door[axis][0] === door[axis][1])!;
      const k = AXES.indexOf(plane);
      const centre = AXES.map((axis) => (door[axis][0] + door[axis][1]) / 2);
      const room = door.between.find((s) => s !== 'space')!;
      const box = boxesOf(room)[0];
      const outward = box[plane][0] === door[plane][0] ? -1 : 1;
      const out = centre.map((v, j) => (j === k ? v + outward * 1.0 : v));
      expect(depth(out[0], out[1], out[2]), door.id).toBeLessThan(0);
    }
  });

  it('keeps every conduit leg inside one compartment, with exterior ends only', () => {
    for (const conduit of conduits) {
      const rooms = conduit.path.map(inRooms);
      rooms.forEach((ids, k) => {
        if (ids.length === 0)
          expect(
            k === 0 || k === rooms.length - 1,
            `${conduit.id} point ${k}`,
          ).toBe(true);
      });
      for (let k = 1; k < rooms.length; k++) {
        if (rooms[k - 1].length === 0 || rooms[k].length === 0) continue;
        const shared = rooms[k].filter((id) => rooms[k - 1].includes(id));
        expect(shared.length, `${conduit.id} leg ${k}`).toBeGreaterThan(0);
        // Points every 0.25 m along the leg, so a leg between two boxes of
        // one room cannot cross the void beside them.
        const [a, b] = [conduit.path[k - 1], conduit.path[k]];
        const steps = Math.ceil(
          Math.hypot(...a.map((v, j) => b[j] - v)) / 0.25,
        );
        for (let s = 1; s < steps; s++) {
          const p = a.map((v, j) => lerp(v, b[j], s / steps));
          expect(
            inRooms(p).length,
            `${conduit.id} leg ${k} at ${p.join(', ')}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('routes a power conduit to each of the seven loads of section 16.4', () => {
    const loads = new Set(
      conduits.filter((c) => c.kind === 'power').map((c) => c.load),
    );
    expect([...loads].sort()).toEqual([
      'comms',
      'ftl-spool',
      'life-support',
      'main-drive',
      'railgun',
      'shields',
      'thrusters',
    ]);
  });

  it('gives each room two to five fixtures, about forty in all', () => {
    for (const room of compartments) {
      expect(room.fixtures.length, room.id).toBeGreaterThanOrEqual(2);
      expect(room.fixtures.length, room.id).toBeLessThanOrEqual(5);
    }
    const total = compartments.reduce((n, c) => n + c.fixtures.length, 0);
    expect(total).toBeGreaterThanOrEqual(35);
    expect(total).toBeLessThanOrEqual(45);
  });

  it('keeps every fixture inside its room, clear of every other fixture', () => {
    const all = compartments.flatMap((c) => c.fixtures);
    for (const room of compartments)
      for (const f of room.fixtures) {
        expect(f.id.startsWith(`${room.id}.`), f.id).toBe(true);
        const inside = room.boxes.some((box) =>
          corners(f).every((p) => contains(box, p)),
        );
        expect(inside, f.id).toBe(true);
      }
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(
          overlapVolume(all[i], all[j]),
          `${all[i].id} and ${all[j].id}`,
        ).toBe(0);
  });

  it('keeps every fixture out of the space in front of each door', () => {
    for (const door of doors.filter((d) => d.kind !== 'bay-door')) {
      const zone = doorZone(door);
      for (const f of compartments.flatMap((c) => c.fixtures))
        expect(overlapVolume(zone, f), `${f.id} at ${door.id}`).toBe(0);
    }
  });

  it('joins every door of a room to the others through free floor at least 1.0 m wide', () => {
    for (const room of compartments) {
      const access = doors
        .filter((d) => d.kind !== 'bay-door' && d.between.includes(room.id))
        .map((d) => accessPoint(room, d));
      if (access.length === 0) continue;
      const floor = access[0].floor;
      for (const a of access) expect(a.floor, room.id).toBe(floor);
      const wide = (x: number, y: number) => wideAt(room, floor, x, y);
      const key = (x: number, y: number) =>
        `${Math.round(x * 10)},${Math.round(y * 10)}`;
      const [start, ...rest] = access.map(
        (a) => [snap(a.x), snap(a.y)] as const,
      );
      for (const [x, y] of [start, ...rest])
        expect(wide(x, y), `${room.id} at ${x}, ${y}`).toBe(true);
      const seen = new Set([key(...start)]);
      const queue = [start];
      while (queue.length > 0) {
        const [x, y] = queue.pop()!;
        for (const [nx, ny] of [
          [x + 0.1, y],
          [x - 0.1, y],
          [x, y + 0.1],
          [x, y - 0.1],
        ]) {
          const k = key(nx, ny);
          if (seen.has(k) || !wide(nx, ny)) continue;
          seen.add(k);
          queue.push([snap(nx), snap(ny)]);
        }
      }
      for (const [x, y] of rest)
        expect(seen.has(key(x, y)), `${room.id} to ${x}, ${y}`).toBe(true);
    }
  });

  it('keeps the radiator vanes on the nacelles and the louvres on the reactor block', () => {
    const { nacelleVanes, flankLouvres } = exterior.radiators;
    for (const nacelle of exterior.nacelles) {
      expect(nacelleVanes.x[0]).toBeGreaterThanOrEqual(nacelle.x[0]);
      expect(nacelleVanes.x[1]).toBeLessThanOrEqual(nacelle.x[1]);
    }
    const reactor = boxesOf('reactor-bay')[0];
    expect(flankLouvres.x[0]).toBeGreaterThanOrEqual(reactor.x[0]);
    expect(flankLouvres.x[1]).toBeLessThanOrEqual(reactor.x[1]);
  });
});
