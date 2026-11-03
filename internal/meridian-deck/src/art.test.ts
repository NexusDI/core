import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

interface Geometry {
  decks: { id: string }[];
  compartments: { fixtures: { id: string; states: string[] }[] }[];
  doors: { id: string }[];
}

interface Sheet {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  >;
  meta: {
    image: string;
    size: { w: number; h: number };
    sources: Record<string, string>;
    related_multi_packs?: string[];
    pixelsPerMetre: number;
  };
}

interface Tile {
  view: string;
  layer: string;
  pass: string;
  size: { width: number; height: number };
  origin: number[];
  pixelsPerMetre: number;
  tile: { name: string; offset: number[] };
  masks: Record<string, { image: string; sidecar: string }>;
  lights: string;
  legend: string;
}

const art = join(import.meta.dirname, '..', 'art');
// The package does not import meridian-systems at run time, so the test reads
// the geometry file by its path.
const geometry = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '../../../examples/meridian-systems/deck/meridian.geometry.json',
    ),
    'utf8',
  ),
) as Geometry;

const read = <T>(...parts: string[]) =>
  JSON.parse(readFileSync(join(art, ...parts), 'utf8')) as T;

/** The pixel size of a WebP file from its header (lossless VP8L, extended VP8X or lossy VP8). */
function webpSize(file: string): { width: number; height: number } {
  const data = readFileSync(file);
  expect(data.toString('latin1', 0, 4)).toBe('RIFF');
  expect(data.toString('latin1', 8, 12)).toBe('WEBP');
  const kind = data.toString('latin1', 12, 16);
  if (kind === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    return {
      width: data.readUIntLE(24, 3) + 1,
      height: data.readUIntLE(27, 3) + 1,
    };
  }
  return {
    width: data.readUInt16LE(26) & 0x3fff,
    height: data.readUInt16LE(28) & 0x3fff,
  };
}

/** Every page of the atlas whose first page is `dir/atlas-0.json`. */
function pagesOf(...dir: string[]): { name: string; sheet: Sheet }[] {
  const first = read<Sheet>(...dir, 'atlas-0.json');
  return [
    { name: 'atlas-0.json', sheet: first },
    ...(first.meta.related_multi_packs ?? []).map((name) => ({
      name,
      sheet: read<Sheet>(...dir, name),
    })),
  ];
}

const atlases = [
  ...geometry.decks.map((deck) => ({ label: deck.id, dir: [deck.id] })),
  { label: 'shared', dir: ['shared'] },
].filter((atlas) => existsSync(join(art, ...atlas.dir, 'atlas-0.json')));

describe('the deck art atlases', () => {
  const frames = new Map<string, string>();
  for (const atlas of atlases)
    for (const { sheet } of pagesOf(...atlas.dir))
      for (const name of Object.keys(sheet.frames))
        frames.set(name, sheet.meta.sources[name] ?? '');

  it('has an atlas for every deck and one for the props that stand on several', () => {
    expect(atlases.map((atlas) => atlas.label)).toEqual([
      ...geometry.decks.map((deck) => deck.id),
      'shared',
    ]);
  });

  it('draws a frame for every state of every fixture and door', () => {
    const missing: string[] = [];
    const wanted = [
      ...geometry.compartments.flatMap((room) => room.fixtures),
      ...geometry.doors.map((door) => ({
        id: door.id,
        states: ['open', 'closed'],
      })),
    ];
    for (const item of wanted)
      for (const state of item.states)
        if (!frames.has(`${item.id}@${state}`))
          missing.push(`${item.id}@${state}`);
    expect(missing).toEqual([]);
  });

  it('draws no frame for an id the geometry lacks', () => {
    const ids = new Set([
      ...geometry.compartments.flatMap((room) =>
        room.fixtures.map((f) => f.id),
      ),
      ...geometry.doors.map((door) => door.id),
    ]);
    for (const name of frames.keys())
      expect(ids.has(name.split('@')[0] ?? ''), name).toBe(true);
  });

  it('marks every frame painted or generated', () => {
    for (const [name, source] of frames)
      expect(['painted', 'generated'], name).toContain(source);
  });

  it('keeps every frame inside its page and every page within 2048 by 2048', () => {
    for (const atlas of atlases)
      for (const { sheet } of pagesOf(...atlas.dir)) {
        const image = join(art, ...atlas.dir, sheet.meta.image);
        expect(webpSize(image)).toEqual({
          width: sheet.meta.size.w,
          height: sheet.meta.size.h,
        });
        expect(sheet.meta.size.w).toBeLessThanOrEqual(2048);
        expect(sheet.meta.size.h).toBeLessThanOrEqual(2048);
        for (const [name, { frame }] of Object.entries(sheet.frames)) {
          expect(frame.x, name).toBeGreaterThanOrEqual(0);
          expect(frame.y, name).toBeGreaterThanOrEqual(0);
          expect(frame.x + frame.w, name).toBeLessThanOrEqual(
            sheet.meta.size.w,
          );
          expect(frame.y + frame.h, name).toBeLessThanOrEqual(
            sheet.meta.size.h,
          );
        }
      }
  });

  it('lists the frames that still have a generated plate', () => {
    const generated = [...frames]
      .filter(([, source]) => source === 'generated')
      .map(([name]) => name)
      .sort();
    console.log(
      `generated frames (${generated.length} of ${frames.size}):\n${generated.join('\n')}`,
    );
    expect(generated.length).toBeLessThanOrEqual(frames.size);
  });
});

describe('the deck art sidecars', () => {
  it('carry the geometry hash of the legend that the layers tool wrote', () => {
    for (const deck of geometry.decks) {
      const hash = read<{ geometry: string }>(
        deck.id,
        'roomid-legend.json',
      ).geometry;
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      const names = readdirSync(join(art, deck.id)).filter(
        (name) => name.endsWith('.json') && name !== 'lights.json',
      );
      expect(names.length).toBeGreaterThan(6);
      for (const name of names) {
        const card = read<{ geometry?: string; meta?: { geometry?: string } }>(
          deck.id,
          name,
        );
        expect(card.geometry ?? card.meta?.geometry, `${deck.id}/${name}`).toBe(
          hash,
        );
      }
      const shared = read<{ meta: { geometry: string } }>(
        'shared',
        'atlas-0.json',
      );
      expect(shared.meta.geometry).toBe(hash);
    }
  });

  it('name the deck view of every atlas, and the views of the shared one', () => {
    for (const deck of geometry.decks) {
      const sheet = read<{ meta: { view: string } }>(deck.id, 'atlas-0.json');
      expect(sheet.meta.view).toBe(`deck-${deck.id}`);
    }
    const shared = read<{ meta: { view?: string; views: string[] } }>(
      'shared',
      'atlas-0.json',
    );
    expect(shared.meta.view).toBeUndefined();
    expect(shared.meta.views).toEqual(['deck-main', 'deck-upper']);
  });

  it('give each legend the bounds of the rooms on its deck', () => {
    for (const deck of geometry.decks) {
      const legend = read<{
        bounds: Record<string, number[]>;
        rooms: Record<string, number>;
      }>(deck.id, 'roomid-legend.json');
      expect(Object.keys(legend.bounds).length).toBeGreaterThan(0);
      for (const room of Object.keys(legend.bounds))
        expect(legend.rooms[room]).toBeDefined();
    }
  });
});

describe('the deck base tiles', () => {
  for (const deck of geometry.decks) {
    it(`gives ${deck.id} two tiles of 1216 by 640 placed by their sidecars`, () => {
      for (const [tile, offset] of [
        ['left', 0],
        ['right', 1216],
      ] as const) {
        const card = read<Tile>(deck.id, `base-${tile}.json`);
        expect(card.view).toBe(`deck-${deck.id}`);
        expect(card.layer).toBe('base');
        expect(card.pass).toBe('swatch-v2');
        expect(card.pixelsPerMetre).toBe(32);
        expect(card.origin).toEqual([64, 320]);
        expect(card.tile).toEqual({ name: tile, offset: [offset, 0] });
        expect(webpSize(join(art, deck.id, `base-${tile}.webp`))).toEqual({
          width: 1216,
          height: 640,
        });
        for (const mask of Object.values(card.masks)) {
          expect(existsSync(join(art, deck.id, mask.image)), mask.image).toBe(
            true,
          );
          expect(
            existsSync(join(art, deck.id, mask.sidecar)),
            mask.sidecar,
          ).toBe(true);
        }
        expect(existsSync(join(art, deck.id, card.lights))).toBe(true);
        expect(existsSync(join(art, deck.id, card.legend))).toBe(true);
      }
    });

    it(`writes no interactive mask for ${deck.id}`, () => {
      expect(
        readdirSync(join(art, deck.id)).filter((name) =>
          /interactive|hit/i.test(name),
        ),
      ).toEqual([]);
    });
  }
});
