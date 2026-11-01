import {
  HINT_PART,
  HIT_PX,
  PARTS_IN_HULL_ORDER,
  ROOM_LABELS,
  WIDE_CROP,
  partById,
  type Point,
  type RoomLabel,
} from './geometry';

/**
 * Where the room labels go on the wide stage, in metres of the schematic's
 * frame. A callout takes a place in the band above or under the hull and is
 * joined to its room by a leader line. An in-room label hangs on the bottom
 * edge of its room. The layout reads the room rects of the schematic and the
 * parts of the ship, and sizes every plate from the text with the type metrics
 * below, so the table of labels holds no coordinates.
 *
 * Each plate and leader must clear every hit ring, the idle hint, the standing
 * note of the flight log and every other plate. When the stage is too narrow
 * for that, no plate is drawn: the layout reports `captions` and the stage
 * names the rooms in a caption line under the ship, as a phone's crops do.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PlacedLabel {
  readonly label: RoomLabel;
  /** The box that the layout cleared; the plate takes exactly this size. */
  readonly box: Box;
  /** From the callout to the room's edge; null for a label inside its room. */
  readonly leader: readonly [Point, Point] | null;
  /** One line for a callout, two for a label inside its room. */
  readonly lines: readonly string[];
}

export interface RoomLayout {
  readonly mode: 'callouts' | 'captions';
  /** The placed plates; empty in `captions` mode. */
  readonly labels: readonly PlacedLabel[];
}

export type RoomRect = readonly [x: number, y: number, w: number, h: number];

/** The type metrics of a plate in CSS pixels, close to the bay's micro type. */
const METRICS = { charPx: 7, lineHeightPx: 18, padPx: 12 } as const;
/** The idle hint in CSS pixels, and the gap that it keeps from its part. */
const HINT = { widthPx: 180, heightPx: 34, gapPx: 22 } as const;
/** The view notes (below a part) and the cut-state callouts (above it), in CSS pixels. */
const NOTE = { widthPx: 260, heightPx: 20, dropPx: 16, startPx: 14 } as const;
const HOLO = { widthPx: 170, heightPx: 70 } as const;
/** The least ring half-size of the overlay in CSS pixels, and its share of the glyph size. */
const RING = { minHalfM: 0.825, minPx: 14, share: 1.1 } as const;

const GAP_M = 0.5;
/** The clearance of a plate, and of a leader (a line needs less than a box). */
const MARGIN_M = 0.15;
const LEADER_MARGIN_M = 0.05;
const STEP_M = 0.25;

/** The lines of a plate: one for a callout, the room and its module for a label inside a room. */
function linesOf(label: RoomLabel): readonly string[] {
  if (label.place === 'in-room')
    return [label.title, `${label.module} (module)`];
  return [
    label.provider
      ? `${label.title} (module), ${label.provider} (provider)`
      : `${label.title}, ${label.module} (module)`,
  ];
}

function sizeOf(lines: readonly string[], ppm: number): [number, number] {
  const chars = Math.max(...lines.map((line) => line.length));
  return [
    (chars * METRICS.charPx + METRICS.padPx) / ppm,
    (lines.length * METRICS.lineHeightPx + 2) / ppm,
  ];
}

const inflate = (box: Box, by: number): Box => ({
  x: box.x - by,
  y: box.y - by,
  w: box.w + 2 * by,
  h: box.h + 2 * by,
});

export function overlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** Whether the segment passes through the box. */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
      return true;
  }
  return false;
}

/**
 * The footprint of each part as a box, in metres. A system, a hatch and the
 * chart server link draw a ring of 2.2 glyph sizes; a conduit shows its handle,
 * which has the hit radius of a fine pointer.
 */
export function glyphBoxes(ppm: number): Box[] {
  const ring =
    RING.share * Math.max(RING.minHalfM / RING.share, RING.minPx / ppm);
  const handle = HIT_PX.fine / 2 / ppm;
  return PARTS_IN_HULL_ORDER.map((part) => {
    const r = part.kind === 'conduit' ? handle : ring;
    return { x: part.at[0] - r, y: part.at[1] - r, w: 2 * r, h: 2 * r };
  });
}

/** The box of the idle hint, which hangs left of the part that it names. */
export function hintBox(ppm: number): Box {
  const at = partById(HINT_PART)?.at ?? [0, 0];
  const w = HINT.widthPx / ppm;
  const h = HINT.heightPx / ppm;
  return { x: at[0] - HINT.gapPx / ppm - w, y: at[1] - h / 2, w, h };
}

/** The note that the flight log carries at rest ("Builds per request"), which starts under its glyph and runs right. */
export function standingNoteBox(ppm: number): Box {
  const at = partById('system-FlightLog')?.at ?? [0, 0];
  const w = 130 / ppm;
  return {
    x: at[0] - NOTE.startPx / ppm,
    y: at[1] + NOTE.dropPx / ppm,
    w,
    h: NOTE.heightPx / ppm,
  };
}

/**
 * Where a state can draw a callout or a note: the cut-state callouts sit above
 * a conduit or a system, the notes below any part. A leader keeps off them
 * when it can.
 */
function transientBoxes(ppm: number): Box[] {
  return PARTS_IN_HULL_ORDER.flatMap((part) => {
    const [x, y] = part.at;
    const boxes: Box[] = [
      {
        x: x - NOTE.widthPx / 2 / ppm,
        y: y + NOTE.dropPx / ppm,
        w: NOTE.widthPx / ppm,
        h: NOTE.heightPx / ppm,
      },
    ];
    if (part.kind === 'conduit' || part.kind === 'system')
      boxes.push({
        x: x - HOLO.widthPx / 2 / ppm,
        y: y - HOLO.heightPx / ppm,
        w: HOLO.widthPx / ppm,
        h: HOLO.heightPx / ppm,
      });
    return boxes;
  });
}

const CAPTIONS: RoomLayout = { mode: 'captions', labels: [] };

export function layoutRoomLabels(
  rects: ReadonlyMap<string, RoomRect>,
  ppm: number,
): RoomLayout {
  const [cropX, cropY, cropW, cropH] = WIDE_CROP;
  const hard = [...glyphBoxes(ppm), hintBox(ppm), standingNoteBox(ppm)].map(
    (box) => inflate(box, MARGIN_M),
  );
  const stiff = [...glyphBoxes(ppm), hintBox(ppm), standingNoteBox(ppm)].map(
    (box) => inflate(box, LEADER_MARGIN_M),
  );
  const soft = transientBoxes(ppm);
  const placed: PlacedLabel[] = [];
  const plates = () => placed.map((entry) => inflate(entry.box, 0.2));

  // Labels inside their rooms first: the callouts steer around them. Each
  // slides along the room's bottom edge to the first clear place.
  for (const label of ROOM_LABELS) {
    if (label.place !== 'in-room') continue;
    const rect = rects.get(label.room);
    if (!rect) return CAPTIONS;
    const lines = linesOf(label);
    const [w, h] = sizeOf(lines, ppm);
    const [rx, ry, rw, rh] = rect;
    const middle = rx + (rw - w) / 2;
    const xs: number[] = [];
    for (let x = rx + 0.1; x + w <= rx + rw - 0.1; x += STEP_M) xs.push(x);
    xs.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    // The bottom edge first, then the top edge.
    const box = [ry + rh - h - 0.4, ry + 0.15]
      .flatMap((y) => xs.map((x) => ({ x, y, w, h })))
      .find(
        (candidate) =>
          ![...hard, ...plates()].some((b) => overlap(candidate, b)),
      );
    if (!box) return CAPTIONS;
    placed.push({ label, box, leader: null, lines });
  }

  for (const side of ['top', 'below'] as const) {
    const group = ROOM_LABELS.filter((label) => label.place === side).sort(
      (a, b) => (rects.get(a.room)?.[0] ?? 0) - (rects.get(b.room)?.[0] ?? 0),
    );
    let free = cropX + MARGIN_M;
    for (const label of group) {
      const rect = rects.get(label.room);
      if (!rect) return CAPTIONS;
      const [rx, ry, rw, rh] = rect;
      const lines = linesOf(label);
      const [w, h] = sizeOf(lines, ppm);
      if (w > cropW) return CAPTIONS;
      const y =
        side === 'top' ? cropY + MARGIN_M : cropY + cropH - MARGIN_M - h;
      const edgeY = side === 'top' ? y + h : y;
      const roomY = side === 'top' ? ry : ry + rh;
      // Anchors along the room's edge, nearest its middle first.
      const middle = rx + rw / 2;
      const anchors: number[] = [];
      for (let x = rx + 0.05; x <= rx + rw - 0.05; x += STEP_M) anchors.push(x);
      anchors.push(rx + rw - 0.05);
      anchors.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
      type Choice = { box: Box; leader: readonly [Point, Point] };
      let clean: Choice | null = null;
      let firm: Choice | null = null;
      for (const anchor of anchors) {
        // Pack the plate against the one before it; it still reaches its anchor.
        const left = Math.min(
          Math.max(free, anchor - w + MARGIN_M),
          cropX + cropW - w,
        );
        const box = { x: left, y, w, h };
        const from: Point = [
          Math.max(box.x, Math.min(anchor, box.x + box.w)),
          edgeY,
        ];
        const leader = [from, [anchor, roomY]] as const;
        if (
          left + w > cropX + cropW ||
          [...hard, ...plates()].some((b) => overlap(box, b)) ||
          [...stiff, ...plates()].some((b) =>
            segmentHitsBox(from, leader[1], b),
          )
        )
          continue;
        firm ??= { box, leader };
        if (!soft.some((b) => segmentHitsBox(from, leader[1], b))) {
          clean = { box, leader };
          break;
        }
      }
      const use = clean ?? firm;
      if (!use) return CAPTIONS;
      free = use.box.x + use.box.w + GAP_M;
      placed.push({ label, box: use.box, leader: use.leader, lines });
    }
  }
  return { mode: 'callouts', labels: placed };
}

/** The rect of each room in the schematic's markup, in metres; the first rect of a room names it. */
export function roomRects(markup: string): Map<string, RoomRect> {
  const rects = new Map<string, RoomRect>();
  for (const [tag] of markup.matchAll(/<rect\b[^>]*>/g)) {
    const attr = (name: string) =>
      new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
    const room = attr('data-room');
    if (!room || rects.has(room)) continue;
    const numbers = ['x', 'y', 'width', 'height'].map((name) =>
      Number(attr(name)),
    );
    if (numbers.every(Number.isFinite))
      rects.set(room, numbers as unknown as RoomRect);
  }
  return rects;
}
