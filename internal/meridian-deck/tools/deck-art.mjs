import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { art, colour } from '@nexusdi/meridian-ui/tokens';

const GEOMETRY_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'examples',
  'meridian-systems',
  'deck',
  'meridian.geometry.json',
);

/** The ship's geometry, read by path: the package imports meridian-systems at no run time. */
export function readGeometry() {
  return JSON.parse(readFileSync(GEOMETRY_FILE, 'utf8'));
}

/**
 * The pure half of the deck art tool (design system 8.3): the footprint of
 * every fixture and door, the painted props that serve them, the generated
 * plates for the rest, the packing of sprites into pages and the Pixi
 * spritesheet JSON of a page. `deck-art-build.mjs` does the file work.
 */

/** Every runtime asset uses one scale, 32 pixels per metre. */
export const PPM = 32;
/** A sprite carries 0.5 m around its footprint for overhang. */
export const MARGIN_PX = 16;
/** The widest and tallest texture every WebGL2 device supports. */
const PAGE_MAX = 2048;
/** A door's frame stands 0.1875 m (6 px) beyond its opening, and 0.375 m deep each way of a wall. */
const FRAME_M = 0.1875;
const WALL_HALF_M = 0.375;
/** Height the floors and the geometry compare within, in metres. */
const EPSILON = 1e-6;

const px = (metres) => Math.max(1, Math.round(metres * PPM));
const flatAxis = (door) =>
  ['x', 'y', 'z'].find((a) => door[a][0] === door[a][1]);

/**
 * The painted props, from the `anchor.json` files of the painted sources. Each
 * entry is `{ name, anchor }`: the prop's folder name and its anchor, whose
 * `source` is a fixture id or `door <id>`, `sprite_px` the sprite size at
 * 32 px/m and `states` the frames it holds. The shape comes from the geometry
 * item of that id, so a new painted prop needs no code change.
 *
 * @param {{ name: string, anchor: { source: string, sprite_px: number[], states: string[] } }[]} anchors
 * @param {ReturnType<typeof itemsOf>} items
 */
export function paintedTableOf(anchors, items) {
  const table = {};
  for (const { name, anchor } of anchors) {
    const door = anchor.source.startsWith('door ');
    const id = door ? anchor.source.slice('door '.length) : anchor.source;
    const item = items.find((candidate) => candidate.id === id);
    if (!item)
      throw new Error(`painted prop ${name}: the geometry has no ${id}`);
    const [width, height] = anchor.sprite_px;
    if (width !== item.size.width || height !== item.size.height)
      throw new Error(
        `painted prop ${name}: the sprite is ${width}x${height}, the footprint of ${id} is ${item.size.width}x${item.size.height}`,
      );
    table[name] = {
      kind: item.kind,
      id,
      shape: item.shape,
      size: { width, height },
      states: [...anchor.states],
    };
  }
  return table;
}

/**
 * The painted frame that draws a state of an item, or undefined. A painted
 * prop with an `off` frame also draws `default`, the state of an item that has
 * none, as its plain unlit frame.
 */
export function stateFrame(painted, state) {
  if (painted.states.includes(state)) return state;
  if (state === 'default' && painted.states.includes('off')) return 'off';
  return undefined;
}

/**
 * The painted prop that serves an item: the same kind and shape, a footprint
 * within one pixel at 32 px/m, which serves the item under its own frame name,
 * and a frame for every state.
 */
export function paintedFor(item, table) {
  const hit = Object.entries(table).find(
    ([, prop]) =>
      prop.kind === item.kind &&
      prop.shape === item.shape &&
      Math.abs(prop.size.width - item.size.width) <= 1 &&
      Math.abs(prop.size.height - item.size.height) <= 1 &&
      item.states.every((state) => stateFrame(prop, state) !== undefined),
  );
  return hit ? { name: hit[0], ...hit[1] } : undefined;
}

function footprintOfDoor(door) {
  const flat = flatAxis(door);
  const grow = (span, by) => [span[0] - by, span[1] + by];
  if (flat === 'z')
    return {
      orientation: 'floor',
      footprint: { x: grow(door.x, FRAME_M), y: grow(door.y, FRAME_M) },
    };
  const across = (value) => [value[0] - WALL_HALF_M, value[1] + WALL_HALF_M];
  return {
    orientation: 'wall',
    footprint:
      flat === 'x'
        ? { x: across(door.x), y: grow(door.y, FRAME_M) }
        : { x: grow(door.x, FRAME_M), y: across(door.y) },
  };
}

/** The decks of a fixture: those of its room that its height reaches, or all of the room's. */
function decksOfFixture(geometry, room, fixture) {
  const own = geometry.decks.filter((deck) => room.decks.includes(deck.id));
  const reached = own.filter(
    (deck) =>
      fixture.z[1] > deck.floor + EPSILON &&
      fixture.z[0] < deck.floor + deck.height - EPSILON,
  );
  return (reached.length > 0 ? reached : own).map((deck) => deck.id);
}

/** The deck of a door: the deck whose floor holds a floor hatch, or whose height holds a wall door. */
function decksOfDoor(geometry, door) {
  const flat = flatAxis(door);
  const middle = (door.z[0] + door.z[1]) / 2;
  const held = geometry.decks.filter((deck) =>
    flat === 'z'
      ? Math.abs(door.z[0] - deck.floor) < 0.01
      : middle >= deck.floor - EPSILON &&
        middle < deck.floor + deck.height - EPSILON,
  );
  if (held.length > 0) return held.map((deck) => deck.id);
  const rooms = geometry.compartments.filter((room) =>
    door.between.includes(room.id),
  );
  return geometry.decks
    .filter((deck) => rooms.some((room) => room.decks.includes(deck.id)))
    .map((deck) => deck.id);
}

/**
 * Every fixture and door of the geometry as one item: its id and kind, its
 * states, the shape its plate draws, its footprint in metres (x aft, y to
 * starboard), the footprint in pixels at 32 px/m, and the decks it stands on.
 */
export function itemsOf(geometry) {
  const items = [];
  for (const room of geometry.compartments) {
    for (const fixture of room.fixtures) {
      items.push({
        id: fixture.id,
        kind: 'fixture',
        states: [...fixture.states],
        shape: fixture.shape === 'cylinder' ? 'ellipse' : 'box',
        emissive: fixture.emissive === true,
        footprint: { x: [...fixture.x], y: [...fixture.y] },
        decks: decksOfFixture(geometry, room, fixture),
      });
    }
  }
  for (const door of geometry.doors) {
    const { footprint, orientation } = footprintOfDoor(door);
    items.push({
      id: door.id,
      kind: 'door',
      doorKind: door.kind,
      emissive: false,
      orientation,
      states: ['closed', 'open'],
      shape: 'box',
      footprint,
      decks: decksOfDoor(geometry, door),
    });
  }
  return items.map((item) => ({
    ...item,
    size: {
      width: px(item.footprint.x[1] - item.footprint.x[0]),
      height: px(item.footprint.y[1] - item.footprint.y[0]),
    },
  }));
}

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/**
 * The steel of the plates, from the dark theme's neutral roles and the hull
 * paint. No role that carries meaning (data, action, alarm, nominal) is used.
 */
const STEEL = {
  outline: rgb(colour.dark.bulkhead),
  shadow: rgb(colour.dark.plate),
  off: rgb(colour.dark.seam),
  plain: rgb(colour.dark.edge),
  on: rgb(colour.dark.textTertiary),
  highlight: rgb(art.hullPaint),
};

/** The body and the lit edge of a state. `damaged` keeps the body of `on` and adds a hatch. */
const TONES = {
  on: { body: STEEL.on, edge: STEEL.highlight },
  damaged: { body: STEEL.on, edge: STEEL.highlight },
  off: { body: STEEL.off, edge: STEEL.plain },
  default: { body: STEEL.plain, edge: STEEL.highlight },
  closed: { body: STEEL.plain, edge: STEEL.highlight },
  open: { body: STEEL.plain, edge: STEEL.highlight },
};

function canvasOf(width, height) {
  const data = new Uint8Array(width * height * 4);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (y * width + x) * 4;
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    data[at + 3] = 255;
  };
  const clear = (x, y) => {
    const at = (y * width + x) * 4;
    data.fill(0, at, at + 4);
  };
  const rect = (x0, y0, x1, y1, tone) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, tone);
  };
  return { width, height, data, put, clear, rect };
}

/** A block of steel: a dark outline, the body, and a lit edge on its top and left. */
function block(canvas, x0, y0, x1, y1, tones) {
  canvas.rect(x0, y0, x1, y1, STEEL.outline);
  canvas.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, tones.body);
  canvas.rect(x0 + 1, y0 + 1, x1 - 1, y0 + 2, tones.edge);
  canvas.rect(x0 + 1, y0 + 1, x0 + 2, y1 - 1, tones.edge);
}

function ellipseBlock(canvas, x0, y0, width, height, tones) {
  const cx = x0 + width / 2;
  const cy = y0 + height / 2;
  const within = (x, y, inset) => {
    const rx = width / 2 - inset;
    const ry = height / 2 - inset;
    if (rx <= 0 || ry <= 0) return false;
    return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  };
  for (let y = y0; y < y0 + height; y++) {
    for (let x = x0; x < x0 + width; x++) {
      if (!within(x, y, 0)) continue;
      if (!within(x, y, 1)) canvas.put(x, y, STEEL.outline);
      else if (!within(x, y, 2) && x + 0.5 + y + 0.5 < cx + cy)
        canvas.put(x, y, tones.edge);
      else canvas.put(x, y, tones.body);
    }
  }
}

/** Diagonal strokes over the body of a damaged plate, each two pixels wide every six. */
function hatchOver(canvas, inside) {
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if ((x + y) % 6 < 2 && inside(x, y)) canvas.put(x, y, STEEL.shadow);
}

function drawDoor(canvas, item, state, left, top) {
  const { width, height } = item.size;
  const closed = state === 'closed';
  const tones = TONES[state];
  const jamb = { body: STEEL.off, edge: STEEL.plain };
  const frame = Math.round(FRAME_M * PPM);
  if (item.orientation === 'wall') {
    const tall = height >= width;
    const [along, across] = tall ? [height, width] : [width, height];
    const cut = (a0, a1, b0, b1) =>
      tall
        ? [left + b0, top + a0, left + b1, top + a1]
        : [left + a0, top + b0, left + a1, top + b1];
    block(canvas, ...cut(0, frame, 0, across), jamb);
    block(canvas, ...cut(along - frame, along, 0, across), jamb);
    const lane = Math.max(2, Math.round(across * 0.4));
    const from = Math.floor((across - lane) / 2);
    if (closed)
      block(canvas, ...cut(frame, along - frame, from, from + lane), tones);
    else
      canvas.rect(
        ...cut(
          frame,
          along - frame,
          Math.floor(across / 2) - 1,
          Math.floor(across / 2) + 1,
        ),
        STEEL.shadow,
      );
    return;
  }
  const opening = [
    left + frame,
    top + frame,
    left + width - frame,
    top + height - frame,
  ];
  block(canvas, left, top, left + width, top + height, jamb);
  for (let y = opening[1]; y < opening[3]; y++)
    for (let x = opening[0]; x < opening[2]; x++) canvas.clear(x, y);
  if (closed) {
    block(canvas, ...opening, tones);
    const along = opening[2] - opening[0] >= opening[3] - opening[1];
    const middle = along
      ? [
          opening[0] + 1,
          Math.floor((opening[1] + opening[3]) / 2),
          opening[2] - 1,
          Math.floor((opening[1] + opening[3]) / 2) + 1,
        ]
      : [
          Math.floor((opening[0] + opening[2]) / 2),
          opening[1] + 1,
          Math.floor((opening[0] + opening[2]) / 2) + 1,
          opening[3] - 1,
        ];
    canvas.rect(...middle, STEEL.outline);
  } else {
    canvas.rect(
      opening[0],
      opening[1],
      opening[2],
      opening[1] + 1,
      STEEL.shadow,
    );
    canvas.rect(
      opening[0],
      opening[1],
      opening[0] + 1,
      opening[3],
      STEEL.shadow,
    );
  }
}

/**
 * The generated sprite of one state of an item: a flat unlit plate cut to the
 * footprint plus the 0.5 m margin, drawn pixel by pixel in neutral steel with
 * no anti-aliasing. `on` is lighter than `off`, `damaged` adds a hatch to
 * `on`, an `open` door shows its opening as a gap, and `default` is the plain
 * plate. The same item and state give the same bytes.
 *
 * @param {{ size: { width: number, height: number }, shape: string, kind: string, orientation?: string }} item
 * @param {string} state
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
export function drawPlate(item, state) {
  const tones = TONES[state];
  if (!tones) throw new Error(`no plate tone for the state "${state}"`);
  const { width, height } = item.size;
  const canvas = canvasOf(width + 2 * MARGIN_PX, height + 2 * MARGIN_PX);
  if (item.kind === 'door') {
    drawDoor(canvas, item, state, MARGIN_PX, MARGIN_PX);
  } else if (item.shape === 'ellipse') {
    ellipseBlock(canvas, MARGIN_PX, MARGIN_PX, width, height, tones);
  } else {
    block(
      canvas,
      MARGIN_PX,
      MARGIN_PX,
      MARGIN_PX + width,
      MARGIN_PX + height,
      tones,
    );
  }
  if (state === 'damaged') {
    const alpha = (x, y) => canvas.data[(y * canvas.width + x) * 4 + 3] === 255;
    const [br, bg, bb] = STEEL.on;
    const body = (x, y) => {
      const at = (y * canvas.width + x) * 4;
      return (
        alpha(x, y) &&
        canvas.data[at] === br &&
        canvas.data[at + 1] === bg &&
        canvas.data[at + 2] === bb
      );
    };
    hatchOver(canvas, body);
  }
  return { width: canvas.width, height: canvas.height, data: canvas.data };
}

/** The state whose frame an emissive item lights: `on`, or its only state. */
export const emissiveState = (item) =>
  item.states.includes('on') ? 'on' : item.states[0];

/**
 * The emissive frame of a generated fixture marked `emissive`: the plate body
 * inset two pixels at full alpha in the `on` steel, so a screen's glow has
 * something to light. Returns undefined for a fixture with no screen.
 *
 * @returns {{ width: number, height: number, data: Uint8Array } | undefined}
 */
export function drawEmissive(item) {
  if (!item.emissive || item.kind !== 'fixture') return undefined;
  const { width, height } = item.size;
  const canvas = canvasOf(width + 2 * MARGIN_PX, height + 2 * MARGIN_PX);
  const inset = 2;
  const cx = MARGIN_PX + width / 2;
  const cy = MARGIN_PX + height / 2;
  for (let y = MARGIN_PX + inset; y < MARGIN_PX + height - inset; y++) {
    for (let x = MARGIN_PX + inset; x < MARGIN_PX + width - inset; x++) {
      const inside =
        item.shape !== 'ellipse' ||
        ((x + 0.5 - cx) / (width / 2 - inset)) ** 2 +
          ((y + 0.5 - cy) / (height / 2 - inset)) ** 2 <=
          1;
      if (inside) canvas.put(x, y, STEEL.on);
    }
  }
  return { width: canvas.width, height: canvas.height, data: canvas.data };
}

/**
 * Packs sprites into pages of at most `PAGE_MAX` on a side with shelves. The
 * smallest width among 256, 512, 1024 and 2048 whose layout fits one page wins
 * by area, and sprites that fit no single page fill pages 2048 wide. Sprites
 * sort by height, width and name, so the layout does not depend on input order.
 *
 * @param {{ name: string, width: number, height: number }[]} sprites
 * @param {{ padding?: number, max?: number }} [options]
 * @returns {{ pages: { width: number, height: number }[], placements: Map<string, { page: number, x: number, y: number }> }}
 */
export function packSprites(sprites, { padding = 2, max = PAGE_MAX } = {}) {
  const sorted = [...sprites].sort(
    (a, b) =>
      b.height - a.height || b.width - a.width || a.name.localeCompare(b.name),
  );
  const lay = (pageWidth) => {
    const pages = [{ width: 0, height: 0 }];
    const placements = new Map();
    let page = 0;
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const sprite of sorted) {
      if (sprite.width > pageWidth || sprite.height > max) return undefined;
      if (x > 0 && x + sprite.width > pageWidth) {
        y += shelf + padding;
        x = 0;
        shelf = 0;
      }
      if (y + sprite.height > max) {
        pages.push({ width: 0, height: 0 });
        page += 1;
        x = 0;
        y = 0;
        shelf = 0;
      }
      placements.set(sprite.name, { page, x, y });
      x += sprite.width + padding;
      shelf = Math.max(shelf, sprite.height);
      const used = pages[page];
      used.width = Math.max(used.width, x - padding);
      used.height = Math.max(used.height, y + sprite.height);
    }
    return { pages, placements };
  };
  const widths = [256, 512, 1024, 2048].filter((width) => width <= max);
  const single = widths
    .map(lay)
    .filter((layout) => layout && layout.pages.length === 1)
    .sort(
      (a, b) =>
        a.pages[0].width * a.pages[0].height -
        b.pages[0].width * b.pages[0].height,
    )[0];
  const packed = single ?? lay(max);
  if (!packed) throw new Error('a sprite is larger than a page');
  return packed;
}

/**
 * The Pixi spritesheet JSON of every page of a packed atlas. Each frame is
 * anchored at its centre, which is the footprint's centre, and
 * `meta.sources` marks it `painted` or `generated`. The first page lists the
 * other pages in `related_multi_packs`, the way Pixi's `Assets` loads them.
 *
 * @param {{ name: string, width: number, height: number, source: string }[]} sprites
 * @param {ReturnType<typeof packSprites>} packed
 * @param {{ view?: string, views?: string[], stem: string, geometry: string, extra?: object }} meta
 */
export function sheetOf(
  sprites,
  packed,
  { view, views, stem, geometry, extra = {} },
) {
  const names = packed.pages.map((_, n) => `${stem}-${n}`);
  return packed.pages.map((page, n) => {
    const here = sprites
      .filter((sprite) => packed.placements.get(sprite.name).page === n)
      .sort((a, b) => a.name.localeCompare(b.name));
    const frames = {};
    const sources = {};
    for (const sprite of here) {
      const { x, y } = packed.placements.get(sprite.name);
      frames[sprite.name] = {
        frame: { x, y, w: sprite.width, h: sprite.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: sprite.width, h: sprite.height },
        sourceSize: { w: sprite.width, h: sprite.height },
        anchor: { x: 0.5, y: 0.5 },
      };
      sources[sprite.name] = sprite.source;
    }
    const meta = {
      app: 'nexusdi deck-art',
      version: '1',
      image: `${names[n]}.webp`,
      format: 'RGBA8888',
      size: { w: page.width, h: page.height },
      scale: '1',
      ...(view ? { view } : { views }),
      layer: 'props',
      pixelsPerMetre: PPM,
      marginPx: MARGIN_PX,
      sources,
      ...extra,
      geometry,
    };
    if (n === 0 && names.length > 1)
      meta.related_multi_packs = names.slice(1).map((name) => `${name}.json`);
    return {
      name: `${names[n]}.json`,
      image: `${names[n]}.webp`,
      page: n,
      sprites: here,
      json: { frames, meta },
    };
  });
}
