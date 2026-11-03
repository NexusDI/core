import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import {
  MARGIN_PX,
  PPM,
  drawPlate,
  geometryHash,
  itemsOf,
  packSprites,
  paintedFor,
  readGeometry,
  sheetOf,
  stateFrame,
} from './deck-art.mjs';

/**
 * Builds the deck art of `internal/meridian-deck/art` (design system 8.3, map
 * runtime 4.2): per deck the painted base as two WebP tiles, and the prop
 * atlases. The painted sources are not in the repository, so a run names the
 * folder that holds them:
 *
 *   node tools/deck-art-build.mjs --paintover <dir> [--out <dir>] [--preview <dir>]
 *
 * `<dir>/decks/<deck>/paint/deck-<deck>-swatch-v2.png` is the round-2 base at
 * 2432 by 640 and `<dir>/props/<prop>/<prop>-<state>-s211.png` the painted
 * props at 32 px/m, each with an `emissive-<state>.png` mask beside it. The
 * masks, lights and legends come from `ship_svg.py --deck-layers` into the same
 * output folder. No image model runs here: the script crops, packs and draws.
 *
 * A fixture or door that no painted prop serves gets a generated plate, and
 * the atlas marks every frame `painted` or `generated`. Items that stand on
 * several decks go into the shared atlas. `--preview` writes, per deck, the
 * base with every item at its footprint in its first state and the atlas pages
 * on a checker, and nothing else.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TILES = [
  ['left', 0],
  ['right', 1216],
];
const TILE = { width: 1216, height: 640 };
const FRAME = '-2 -10 76 20';
const ORIGIN = [64, 320];
/** The paint pass of the round-2 picks, named in each base sidecar. */
export const BASE_PASS = 'swatch-v2';
export const PROP_PASS = 's211';
const BUDGET = 1.2 * 1024 * 1024;

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function raw(source) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** The painted sprite of a frame on a clear canvas, with the 0.5 m margin around it. */
async function paintedSprite(paintover, prop, frame, item, emissive) {
  const sprite = await raw(
    join(paintover, 'props', prop.name, `${prop.name}-${frame}-s211.png`),
  );
  if (sprite.width !== prop.size.width || sprite.height !== prop.size.height)
    throw new Error(
      `${prop.name}-${frame}: ${sprite.width}x${sprite.height}, expected ${prop.size.width}x${prop.size.height}`,
    );
  let alpha = null;
  if (emissive) {
    const mask = await sharp(
      join(paintover, 'props', prop.name, `emissive-${frame}.png`),
    )
      .greyscale()
      .raw()
      .toBuffer();
    alpha = mask;
  }
  const width = item.size.width + 2 * MARGIN_PX;
  const height = item.size.height + 2 * MARGIN_PX;
  const data = new Uint8Array(width * height * 4);
  const offsetX = MARGIN_PX + Math.round((item.size.width - sprite.width) / 2);
  const offsetY =
    MARGIN_PX + Math.round((item.size.height - sprite.height) / 2);
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const from = (y * sprite.width + x) * 4;
      const to = ((y + offsetY) * width + x + offsetX) * 4;
      data.set(sprite.data.subarray(from, from + 3), to);
      data[to + 3] = alpha
        ? Math.round(
            (alpha[y * sprite.width + x] * sprite.data[from + 3]) / 255,
          )
        : sprite.data[from + 3];
    }
  }
  return { width, height, data };
}

/** Every sprite of an item: one per state, plus the emissive frame of each painted state. */
async function spritesOf(paintover, item) {
  const painted = paintedFor(item);
  const sprites = [];
  for (const state of item.states) {
    if (painted) {
      const frame = stateFrame(painted, state);
      sprites.push({
        name: `${item.id}@${state}`,
        source: 'painted',
        ...(await paintedSprite(paintover, painted, frame, item, false)),
      });
      sprites.push({
        name: `${item.id}@${state}#emissive`,
        source: 'painted',
        ...(await paintedSprite(paintover, painted, frame, item, true)),
      });
    } else {
      sprites.push({
        name: `${item.id}@${state}`,
        source: 'generated',
        ...drawPlate(item, state),
      });
    }
  }
  return sprites;
}

async function webp(sprite) {
  return sharp(Buffer.from(sprite.data), {
    raw: { width: sprite.width, height: sprite.height, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

async function writeAtlas(dir, sprites, view, geometry) {
  const packed = packSprites(sprites, { padding: 2 });
  const sheets = sheetOf(sprites, packed, { view, stem: 'atlas', geometry });
  const bytes = [];
  for (const sheet of sheets) {
    const page = packed.pages[sheet.page];
    const canvas = new Uint8Array(page.width * page.height * 4);
    for (const sprite of sheet.sprites) {
      const at = packed.placements.get(sprite.name);
      for (let y = 0; y < sprite.height; y++) {
        const from = y * sprite.width * 4;
        canvas.set(
          sprite.data.subarray(from, from + sprite.width * 4),
          ((at.y + y) * page.width + at.x) * 4,
        );
      }
    }
    const image = await webp({ ...page, data: canvas });
    writeFileSync(join(dir, sheet.image), image);
    writeFileSync(join(dir, sheet.name), json(sheet.json));
    bytes.push({ name: sheet.image, bytes: image.length, image, ...page });
  }
  return { sheets, bytes, packed };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
  };
  const paintover = option('--paintover');
  if (!paintover) throw new Error('--paintover <dir> is required');
  const out = resolve(ROOT, option('--out') ?? 'internal/meridian-deck/art');
  const preview = option('--preview');
  const geometry = readGeometry();
  const digest = geometryHash(geometry);
  const items = itemsOf(geometry);
  const spritesByItem = new Map();
  for (const item of items)
    spritesByItem.set(item.id, await spritesOf(resolve(paintover), item));

  const sharedItems = items.filter((item) => item.decks.length > 1);
  const shared = sharedItems.flatMap((item) => spritesByItem.get(item.id));
  const sharedDir = join(out, 'shared');
  rmSync(sharedDir, { recursive: true, force: true });
  let sharedResult = null;
  if (shared.length > 0) {
    mkdirSync(sharedDir, { recursive: true });
    sharedResult = await writeAtlas(sharedDir, shared, 'deck-shared', digest);
  }

  const report = [];
  for (const deck of geometry.decks) {
    const dir = join(out, deck.id);
    mkdirSync(dir, { recursive: true });
    const view = `deck-${deck.id}`;
    const base = await sharp(
      join(
        resolve(paintover),
        'decks',
        deck.id,
        'paint',
        `deck-${deck.id}-swatch-v2.png`,
      ),
    )
      .removeAlpha()
      .toBuffer();
    const baseBytes = [];
    for (const [tile, left] of TILES) {
      const image = await sharp(base)
        .extract({ left, top: 0, ...TILE })
        .webp({ lossless: true, effort: 6 })
        .toBuffer();
      writeFileSync(join(dir, `base-${tile}.webp`), image);
      baseBytes.push(image.length);
      writeFileSync(
        join(dir, `base-${tile}.json`),
        json({
          view,
          layer: 'base',
          size: TILE,
          pixelsPerMetre: PPM,
          origin: ORIGIN,
          frame: FRAME,
          tile: { name: tile, offset: [left, 0] },
          pass: BASE_PASS,
          masks: {
            roomId: {
              image: `roomid-${tile}.png`,
              sidecar: `roomid-${tile}.json`,
            },
            emissive: {
              image: `emissive-${tile}.png`,
              sidecar: `emissive-${tile}.json`,
            },
          },
          lights: 'lights.json',
          legend: 'roomid-legend.json',
          atlas: 'atlas-0.json',
          sharedAtlas: sharedResult ? '../shared/atlas-0.json' : null,
          geometry: digest,
        }),
      );
    }
    const own = items
      .filter((item) => item.decks.length === 1 && item.decks[0] === deck.id)
      .flatMap((item) => spritesByItem.get(item.id));
    const result = await writeAtlas(dir, own, view, digest);
    const decksShared = sharedItems.filter((item) =>
      item.decks.includes(deck.id),
    );
    const sharedBytes = decksShared.length
      ? sharedResult.bytes.reduce((sum, page) => sum + page.bytes, 0)
      : 0;
    const total =
      baseBytes.reduce((a, b) => a + b, 0) +
      result.bytes.reduce((sum, page) => sum + page.bytes, 0) +
      sharedBytes;
    report.push({
      deck: deck.id,
      baseBytes,
      atlas: result.bytes,
      sharedBytes,
      total,
    });
    console.log(
      `${deck.id}: base ${baseBytes.join(' + ')} B, atlas ${result.bytes.map((p) => `${p.name} ${p.width}x${p.height} ${p.bytes} B`).join(', ')}, shared ${sharedBytes} B, total ${total} B (${((total / BUDGET) * 100).toFixed(0)}% of 1.2 MB)`,
    );
    if (preview)
      await writePreview(preview, deck, base, items, result, sharedResult);
  }
  if (sharedResult)
    console.log(
      `shared: ${sharedResult.bytes.map((p) => `${p.name} ${p.width}x${p.height} ${p.bytes} B`).join(', ')}`,
    );
  const generated = items.flatMap((item) =>
    paintedFor(item) ? [] : item.states.map((state) => `${item.id}@${state}`),
  );
  console.log(`generated frames: ${generated.length}`);
}

/** The preview for the reviewer: the base with every item in its first state, and the atlas pages. */
async function writePreview(dir, deck, base, items, result, sharedResult) {
  mkdirSync(dir, { recursive: true });
  const pool = new Map();
  for (const sheet of [...result.sheets, ...(sharedResult?.sheets ?? [])])
    for (const sprite of sheet.sprites) pool.set(sprite.name, sprite);
  const layers = [];
  for (const item of items.filter((i) => i.decks.includes(deck.id))) {
    const sprite = pool.get(`${item.id}@${item.states[0]}`);
    const centreX = ((item.footprint.x[0] + item.footprint.x[1]) / 2 + 2) * PPM;
    const centreY =
      (10 - (item.footprint.y[0] + item.footprint.y[1]) / 2) * PPM;
    layers.push({
      input: Buffer.from(sprite.data),
      raw: { width: sprite.width, height: sprite.height, channels: 4 },
      left: Math.round(centreX - sprite.width / 2),
      top: Math.round(centreY - sprite.height / 2),
    });
  }
  await sharp(base)
    .composite(layers)
    .png()
    .toFile(join(dir, `deck-${deck.id}.png`));
  await contactSheet(
    [...result.bytes, ...(sharedResult?.bytes ?? [])],
    join(dir, `atlas-${deck.id}.png`),
  );
}

/** The atlas pages side by side on a checker, so a clear margin shows as the checker. */
async function contactSheet(pages, file) {
  const gap = 16;
  const width = pages.reduce((sum, page) => sum + page.width + gap, gap);
  const height = Math.max(...pages.map((page) => page.height)) + 2 * gap;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const tone = ((x >> 3) + (y >> 3)) % 2 ? 58 : 74;
      data.fill(tone, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  let left = gap;
  const layers = [];
  for (const page of pages) {
    layers.push({ input: page.image, left, top: gap });
    left += page.width + gap;
  }
  await sharp(data, { raw: { width, height, channels: 3 } })
    .composite(layers)
    .png()
    .toFile(file);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
