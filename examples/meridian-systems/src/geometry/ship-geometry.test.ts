import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { COMPARTMENT_IDS } from '../simulation/contracts';
import {
  SHIP_GEOMETRY,
  type Box,
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

/** The hull's octagon at `x`, as (y, z) corners counter-clockwise from the port keel corner. */
function section(x: number): (readonly [number, number])[] {
  const stations = hull.stations;
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

/** The distance from (y, z) to the outside of the convex section; negative outside. */
function depth(x: number, y: number, z: number): number {
  const corners = section(x);
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

function corners(box: Box): Point[] {
  const out: Point[] = [];
  for (const x of box.x)
    for (const y of box.y) for (const z of box.z) out.push([x, y, z]);
  return out;
}

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
      exterior.windowBand,
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
    expect(Math.max(...hull.stations.map((s) => s.halfBeam)) * 2).toBe(
      hull.beam,
    );
    expect(Math.min(...hull.stations.map((s) => s.bottom))).toBe(0);
    expect(exterior.railgun.breechHump.top).toBe(hull.height);
    for (const bell of exterior.engineBells)
      expect(bell.x[1]).toBe(hull.length);
    expect(hull.stations[0].x).toBe(0);
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

  it('sweeps the radiator wings to a span of 96 m', () => {
    const tips = exterior.radiatorWings.map((w) => w.tip.y);
    expect(Math.max(...tips) - Math.min(...tips)).toBe(96);
    for (const wing of exterior.radiatorWings) {
      const sweep =
        (Math.atan2(
          wing.tip.x[0] - wing.root.x[0],
          Math.abs(wing.tip.y - wing.root.y),
        ) *
          180) /
        Math.PI;
      expect(Math.abs(sweep - wing.sweepDeg)).toBeLessThan(0.5);
    }
  });
});
