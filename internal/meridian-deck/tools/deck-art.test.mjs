// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  MARGIN_PX,
  drawEmissive,
  drawPlate,
  itemsOf,
  packSprites,
  paintedFor,
  paintedTableOf,
  readGeometry,
  sheetOf,
  stateFrame,
} from './deck-art.mjs';

const geometry = readGeometry();
const items = itemsOf(geometry);
const byId = (id) => items.find((item) => item.id === id);

/** The anchor.json files of the four painted props, as the paint-over writes them. */
const anchors = [
  [
    'console',
    {
      source: 'bridge.forward-console',
      sprite_px: [32, 224],
      states: ['off', 'on', 'damaged'],
    },
  ],
  [
    'bunk',
    {
      source: 'quarters.bunks-forward',
      sprite_px: [64, 58],
      states: ['off', 'on'],
    },
  ],
  [
    'reactor',
    {
      source: 'reactor-bay.vessel',
      sprite_px: [224, 224],
      states: ['off', 'on'],
    },
  ],
  [
    'hatch',
    {
      source: 'door bridge-habitat',
      sprite_px: [24, 60],
      states: ['closed', 'open'],
    },
  ],
].map(([name, anchor]) => ({ name, anchor }));
const PAINTED = paintedTableOf(anchors, items);

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const at = (plate, x, y) => {
  const base = (y * plate.width + x) * 4;
  return [...plate.data.slice(base, base + 4)];
};
const opaque = (plate) => {
  const out = [];
  const { data, width } = plate;
  for (let at = 3; at < data.length; at += 4)
    if (data[at] > 0) {
      const pixel = (at - 3) / 4;
      out.push([pixel % width, Math.floor(pixel / width)]);
    }
  return out;
};
const meanOf = (plate) => {
  const hit = opaque(plate).map(([x, y]) => at(plate, x, y));
  return luminance(
    [0, 1, 2].map(
      (channel) => hit.reduce((sum, p) => sum + p[channel], 0) / hit.length,
    ),
  );
};

describe('the items the atlases draw', () => {
  it('lists every fixture and door of the geometry once', () => {
    const fixtures = geometry.compartments.flatMap((room) => room.fixtures);
    expect(items.map((item) => item.id).sort()).toEqual(
      [...fixtures, ...geometry.doors].map((item) => item.id).sort(),
    );
  });

  it('takes a fixture footprint from its box and a wall door footprint from its frame', () => {
    expect(byId('bridge.forward-console').size).toEqual({
      width: 32,
      height: 224,
    });
    expect(byId('bridge-habitat').footprint).toEqual({
      x: [9.625, 10.375],
      y: [-2.4375, -0.5625],
    });
    expect(byId('bridge-habitat').size).toEqual({ width: 24, height: 60 });
    expect(byId('habitat-airlock').size).toEqual({ width: 60, height: 24 });
  });

  it('draws a cylinder as an ellipse and a door as a box', () => {
    expect(byId('reactor-bay.vessel').shape).toBe('ellipse');
    expect(byId('bridge.helm').shape).toBe('box');
    expect(byId('bridge-habitat').shape).toBe('box');
  });

  it('gives a door open and closed and a fixture its own states', () => {
    expect(byId('bridge-habitat').states).toEqual(['closed', 'open']);
    expect(byId('ftl-core.ring').states).toEqual(['on', 'off', 'damaged']);
  });

  it('places every item on a deck, and a tall one on each deck it reaches', () => {
    for (const item of items)
      expect(item.decks.length, item.id).toBeGreaterThan(0);
    expect(byId('reactor-bay.vessel').decks).toEqual(['main', 'upper']);
    expect(byId('bridge.forward-console').decks).toEqual(['main']);
    expect(byId('drone-bay.drone').decks).toEqual(['lower']);
    expect(byId('bridge-computer-core').decks).toEqual(['main']);
    expect(byId('shuttle-bay-outer').decks).toEqual(['lower']);
  });
});

describe('the painted props', () => {
  it('serves its own fixture and every item whose footprint matches', () => {
    const served = items
      .filter((item) => paintedFor(item, PAINTED))
      .map((item) => [item.id, paintedFor(item, PAINTED).name]);
    expect(served).toContainEqual(['bridge.forward-console', 'console']);
    expect(served).toContainEqual(['reactor-bay.vessel', 'reactor']);
    expect(served).toContainEqual(['quarters.bunks-forward', 'bunk']);
    expect(served).toContainEqual(['quarters.bunks-aft', 'bunk']);
    expect(served).toContainEqual(['bridge-habitat', 'hatch']);
    expect(served).toContainEqual(['bridge-chart-room', 'hatch']);
  });

  it('refuses a footprint of another size or shape and a state the sprite lacks', () => {
    expect(paintedFor(byId('bridge.helm'), PAINTED)).toBeUndefined();
    expect(paintedFor(byId('habitat-airlock'), PAINTED)).toBeUndefined();
    expect(paintedFor(byId('ftl-core.ring'), PAINTED)).toBeUndefined();
    expect(paintedFor(byId('bridge-computer-core'), PAINTED)).toBeUndefined();
  });

  it('builds the table from the anchor files and the geometry', () => {
    expect(Object.keys(PAINTED).sort()).toEqual([
      'bunk',
      'console',
      'hatch',
      'reactor',
    ]);
    expect(PAINTED.hatch).toMatchObject({
      id: 'bridge-habitat',
      kind: 'door',
      shape: 'box',
      size: { width: 24, height: 60 },
    });
    expect(PAINTED.reactor.shape).toBe('ellipse');
    expect(PAINTED.console.states).toEqual(['off', 'on', 'damaged']);
  });

  it('serves a new painted prop with no code change', () => {
    const more = paintedTableOf(
      [
        ...anchors,
        {
          name: 'helm',
          anchor: {
            source: 'bridge.helm',
            sprite_px: [32, 70],
            states: ['off', 'on'],
          },
        },
      ],
      items,
    );
    expect(paintedFor(byId('bridge.helm'), more)?.name).toBe('helm');
  });

  it('refuses an anchor whose id the geometry lacks or whose sprite is not its footprint', () => {
    expect(() =>
      paintedTableOf(
        [
          {
            name: 'x',
            anchor: { source: 'nowhere', sprite_px: [1, 1], states: ['on'] },
          },
        ],
        items,
      ),
    ).toThrow(/nowhere/);
    expect(() =>
      paintedTableOf(
        [
          {
            name: 'x',
            anchor: {
              source: 'bridge.helm',
              sprite_px: [9, 9],
              states: ['on'],
            },
          },
        ],
        items,
      ),
    ).toThrow(/bridge\.helm/);
  });

  it('names the painted frame a state uses', () => {
    expect(stateFrame(PAINTED.bunk, 'default')).toBe('off');
    expect(stateFrame(PAINTED.console, 'on')).toBe('on');
    expect(stateFrame(PAINTED.console, 'damaged')).toBe('damaged');
  });
});

/** Every plate of every state, drawn once for the tests that scan them all. */
const rendered = items.flatMap((item) =>
  item.states.map((state) => ({
    name: `${item.id}@${state}`,
    plate: drawPlate(item, state),
  })),
);

describe('a generated plate', () => {
  it('is the footprint plus a margin of 0.5 m on every side, and the margin is clear', () => {
    const item = byId('bridge.helm');
    const plate = drawPlate(item, 'on');
    expect(plate.width).toBe(item.size.width + 2 * MARGIN_PX);
    expect(plate.height).toBe(item.size.height + 2 * MARGIN_PX);
    expect(at(plate, 0, 0)[3]).toBe(0);
    expect(at(plate, MARGIN_PX - 1, plate.height / 2)[3]).toBe(0);
    expect(at(plate, MARGIN_PX + 4, MARGIN_PX + 4)[3]).toBe(255);
    expect(MARGIN_PX).toBe(16);
  });

  it('shows on lighter than off and takes the default between them', () => {
    const item = byId('bridge.helm');
    const on = meanOf(drawPlate(item, 'on'));
    const off = meanOf(drawPlate(item, 'off'));
    const plain = meanOf(drawPlate(byId('habitat.mess-table'), 'default'));
    expect(on).toBeGreaterThan(off + 20);
    expect(plain).toBeGreaterThan(off);
    expect(plain).toBeLessThan(on);
  });

  it('adds a hatch to damaged and nothing else', () => {
    const item = byId('ftl-core.ring');
    const damaged = drawPlate(item, 'damaged');
    const on = drawPlate(item, 'on');
    expect(opaque(damaged)).toEqual(opaque(on));
    const differing = opaque(on).filter(
      ([x, y]) => at(damaged, x, y).join() !== at(on, x, y).join(),
    );
    expect(differing.length).toBeGreaterThan(20);
    expect(differing.length).toBeLessThan(opaque(on).length);
  });

  it('draws no meaning hue: every pixel is a steel grey within a small blue tint', () => {
    const bad = [];
    for (const { name, plate } of rendered) {
      const { data } = plate;
      for (let at = 0; at < data.length; at += 4) {
        if (data[at + 3] === 0) continue;
        const tint = data[at + 2] - data[at];
        if (tint < 0 || tint > 26 || Math.abs(data[at + 1] - data[at]) > 12) {
          bad.push(name);
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('shows an open door as a gap and a closed door as a leaf', () => {
    const door = byId('bridge-chart-room');
    const closed = drawPlate(door, 'closed');
    const open = drawPlate(door, 'open');
    expect(opaque(open).length).toBeLessThan(opaque(closed).length);
    const centre = [closed.width / 2, closed.height / 2].map(Math.floor);
    expect(at(closed, ...centre)[3]).toBe(255);
    expect(at(open, centre[0] + 5, centre[1])[3]).toBe(0);
  });

  it('fills an ellipse inside its box and leaves the corners clear', () => {
    const plate = drawPlate(byId('bridge.command-chair'), 'default');
    expect(at(plate, MARGIN_PX, MARGIN_PX)[3]).toBe(0);
    expect(at(plate, plate.width / 2, plate.height / 2)[3]).toBe(255);
  });

  it('draws the same bytes twice', () => {
    for (const item of items.slice(0, 12)) {
      const a = drawPlate(item, item.states[0]);
      const b = drawPlate(item, item.states[0]);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    }
  });

  it('draws a plate for every state of every item', () => {
    for (const item of items)
      for (const state of item.states)
        expect(drawPlate(item, state).data.length, item.id).toBeGreaterThan(0);
  });
});

describe('a generated emissive frame', () => {
  it('lights the plate body inset two pixels, and only for a fixture marked emissive', () => {
    const item = byId('bridge.helm');
    expect(item.emissive).toBe(true);
    const frame = drawEmissive(item);
    const plate = drawPlate(item, 'on');
    expect([frame.width, frame.height]).toEqual([plate.width, plate.height]);
    expect(at(frame, MARGIN_PX + 1, MARGIN_PX + 1)[3]).toBe(0);
    expect(at(frame, MARGIN_PX + 2, MARGIN_PX + 2)[3]).toBe(255);
    expect(
      at(frame, plate.width - MARGIN_PX - 3, plate.height - MARGIN_PX - 3)[3],
    ).toBe(255);
    expect(at(frame, plate.width - MARGIN_PX - 2, plate.height / 2)[3]).toBe(0);
    expect(byId('habitat.mess-table').emissive).toBe(false);
    expect(drawEmissive(byId('habitat.mess-table'))).toBeUndefined();
  });
});

describe('packing sprites into pages', () => {
  const sprites = [
    { name: 'a@on', width: 100, height: 40 },
    { name: 'b@on', width: 60, height: 200 },
    { name: 'c@on', width: 300, height: 30 },
    { name: 'd@on', width: 50, height: 50 },
  ];

  it('places every sprite inside a page of 2048 or less with padding between', () => {
    const { pages, placements } = packSprites(sprites, { padding: 2 });
    expect(placements.size).toBe(sprites.length);
    for (const page of pages) {
      expect(page.width).toBeLessThanOrEqual(2048);
      expect(page.height).toBeLessThanOrEqual(2048);
    }
    const boxes = sprites.map((s) => {
      const at = placements.get(s.name);
      return { ...at, w: s.width, h: s.height, name: s.name };
    });
    for (const box of boxes) {
      const page = pages[box.page];
      expect(box.x + box.w).toBeLessThanOrEqual(page.width);
      expect(box.y + box.h).toBeLessThanOrEqual(page.height);
    }
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b || a.page !== b.page) continue;
        const apart =
          a.x + a.w + 2 <= b.x ||
          b.x + b.w + 2 <= a.x ||
          a.y + a.h + 2 <= b.y ||
          b.y + b.h + 2 <= a.y;
        expect(apart, `${a.name} and ${b.name}`).toBe(true);
      }
  });

  it('starts a second page when one page cannot hold the sprites', () => {
    const wide = Array.from({ length: 5 }, (_, n) => ({
      name: `w${n}@on`,
      width: 1500,
      height: 1000,
    }));
    const { pages } = packSprites(wide, { padding: 2 });
    expect(pages.length).toBeGreaterThan(1);
  });

  it('is the same for the same sprites in any order', () => {
    const a = packSprites(sprites, { padding: 2 });
    const b = packSprites([...sprites].reverse(), { padding: 2 });
    expect(Object.fromEntries(a.placements)).toEqual(
      Object.fromEntries(b.placements),
    );
    expect(a.pages).toEqual(b.pages);
  });
});

describe('the spritesheet of a page', () => {
  it('lists frames with their anchors, their source and the pages that follow', () => {
    const sprites = [
      { name: 'x@on', width: 10, height: 12, source: 'painted' },
      { name: 'y@default', width: 20, height: 8, source: 'generated' },
    ];
    const packed = packSprites(sprites, { padding: 2 });
    const sheets = sheetOf(sprites, packed, {
      view: 'deck-main',
      stem: 'atlas',
      geometry: 'abc',
    });
    expect(sheets).toHaveLength(1);
    const [sheet] = sheets;
    expect(sheet.json.meta.image).toBe('atlas-0.webp');
    expect(sheet.json.frames['x@on'].anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(sheet.json.frames['x@on'].frame.w).toBe(10);
    expect(sheet.json.meta.sources).toEqual({
      'x@on': 'painted',
      'y@default': 'generated',
    });
    expect(sheet.json.meta.view).toBe('deck-main');
    expect(sheet.json.meta.pixelsPerMetre).toBe(32);
    expect(sheet.json.meta.geometry).toBe('abc');
    expect(sheet.name).toBe('atlas-0.json');
  });

  it('names the views of a shared atlas and no view of its own', () => {
    const sprites = [
      { name: 'x@on', width: 10, height: 12, source: 'generated' },
    ];
    const [sheet] = sheetOf(sprites, packSprites(sprites), {
      views: ['deck-main', 'deck-upper'],
      stem: 'atlas',
      geometry: 'abc',
    });
    expect(sheet.json.meta.views).toEqual(['deck-main', 'deck-upper']);
    expect(sheet.json.meta.view).toBeUndefined();
  });
});
