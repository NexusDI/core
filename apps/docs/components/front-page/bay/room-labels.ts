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
 * edge of its room. Every position comes from the room rects of the schematic
 * and the parts of the ship, so no pixel is written down: the layout keeps
 * each label and leader off every hit circle and off the idle hint.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PlacedLabel {
  readonly label: RoomLabel;
  readonly box: Box;
  /** From the callout to the room's edge; null for a label inside its room. */
  readonly leader: readonly [Point, Point] | null;
  readonly lines: readonly string[];
}

export type RoomRect = readonly [x: number, y: number, w: number, h: number];

/** The text metrics of a label in CSS pixels, close to the bay's micro type. */
const METRICS = { charPx: 6.6, linePx: 18, padPx: 10 } as const;
/** The idle hint's size in CSS pixels, and the gap that it keeps from its part. */
const HINT = { widthPx: 180, heightPx: 34, gapPx: 22 } as const;

const GAP_M = 0.5;
const MARGIN_M = 0.15;
const STEP_M = 0.25;

function linesOf(label: RoomLabel): readonly string[] {
  return [
    label.title,
    `${label.module} (module)`,
    ...(label.provider ? [`${label.provider} (provider)`] : []),
  ];
}

function sizeOf(lines: readonly string[], ppm: number): [number, number] {
  const chars = Math.max(...lines.map((line) => line.length));
  return [
    (chars * METRICS.charPx + METRICS.padPx) / ppm,
    (lines.length * METRICS.linePx) / ppm,
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

/** The hit circle of each part as a box, in metres, for a fine pointer. */
export function glyphBoxes(ppm: number): Box[] {
  const r = HIT_PX.fine / 2 / ppm;
  return PARTS_IN_HULL_ORDER.map((part) => ({
    x: part.at[0] - r,
    y: part.at[1] - r,
    w: 2 * r,
    h: 2 * r,
  }));
}

/** The box of the idle hint, which hangs left of the part that it names. */
export function hintBox(ppm: number): Box {
  const at = partById(HINT_PART)?.at ?? [0, 0];
  const w = HINT.widthPx / ppm;
  const h = HINT.heightPx / ppm;
  return { x: at[0] - HINT.gapPx / ppm - w, y: at[1] - h / 2, w, h };
}

export function layoutRoomLabels(
  rects: ReadonlyMap<string, RoomRect>,
  ppm: number,
): PlacedLabel[] {
  const [cropX, cropY, cropW, cropH] = WIDE_CROP;
  const obstacles = [...glyphBoxes(ppm), hintBox(ppm)].map((box) =>
    inflate(box, MARGIN_M),
  );
  const placed: PlacedLabel[] = [];

  // Labels inside their rooms first: the callouts steer around them.
  for (const label of ROOM_LABELS) {
    const rect = rects.get(label.room);
    if (!rect || !label.place.startsWith('in-')) continue;
    const lines = linesOf(label);
    const [w, h] = sizeOf(lines, ppm);
    const [rx, ry, rw, rh] = rect;
    const x = rx + (rw - w) / 2;
    placed.push({
      label,
      box: { x, y: ry + rh - h - 0.4, w, h },
      leader: null,
      lines,
    });
  }
  const inside = placed.map((entry) => inflate(entry.box, 0.2));

  for (const side of ['top', 'below'] as const) {
    const group = ROOM_LABELS.filter(
      (label) => label.place === side && rects.has(label.room),
    ).sort(
      (a, b) =>
        (rects.get(a.room) as RoomRect)[0] - (rects.get(b.room) as RoomRect)[0],
    );
    let free = cropX + MARGIN_M;
    for (const label of group) {
      const [rx, ry, rw, rh] = rects.get(label.room) as RoomRect;
      const lines = linesOf(label);
      const [w, h] = sizeOf(lines, ppm);
      const y =
        side === 'top' ? cropY + MARGIN_M : cropY + cropH - MARGIN_M - h;
      const edgeY = side === 'top' ? y + h : y;
      const roomY = side === 'top' ? ry : ry + rh;
      // Anchors along the room's edge, nearest its middle first.
      const middle = rx + rw / 2;
      const anchors: number[] = [];
      for (let x = rx + 0.2; x <= rx + rw - 0.2; x += STEP_M) anchors.push(x);
      anchors.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
      type Choice = { box: Box; leader: readonly [Point, Point] };
      let choice: Choice | null = null;
      let fallback: Choice | null = null;
      for (const anchor of anchors) {
        const left = Math.max(
          free,
          Math.min(anchor - w / 2, cropX + cropW - w),
        );
        const box = { x: left, y, w, h };
        const from: Point = [
          Math.max(box.x, Math.min(anchor, box.x + box.w)),
          edgeY,
        ];
        const leader = [from, [anchor, roomY]] as const;
        fallback ??= { box, leader };
        const blocked = [...obstacles, ...inside];
        if (
          blocked.some(
            (b) => overlap(box, b) || segmentHitsBox(from, leader[1], b),
          )
        )
          continue;
        choice = { box, leader };
        break;
      }
      const use = choice ?? (fallback as Choice);
      free = use.box.x + use.box.w + GAP_M;
      placed.push({ label, box: use.box, leader: use.leader, lines });
    }
  }
  return placed;
}

/** The rect of each room in the schematic's markup, in metres; the first rect of a room names it. */
export function roomRects(markup: string): Map<string, RoomRect> {
  const rects = new Map<string, RoomRect>();
  for (const match of markup.matchAll(
    /<rect[^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" data-room="([^"]+)"/g,
  )) {
    const id = match[5] as string;
    if (!rects.has(id))
      rects.set(id, [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
      ]);
  }
  return rects;
}
