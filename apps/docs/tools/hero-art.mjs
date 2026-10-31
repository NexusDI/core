import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

/**
 * Bakes the front page's hero art (site UX spec 4.2). Run by hand with
 * `node tools/hero-art.mjs` after the master changes; the outputs are
 * committed and the docs build never runs it.
 *
 * The master is the paint-over of the Meridian on a flat dark ground. The
 * script finds the ground by colour distance from that flat colour, flood
 * filled from the border, so the dark parts of the hull stay hull. It
 * replaces the ground with the `space` colour of the tokens and draws a
 * static starfield from a fixed seed, and only on ground pixels, so no star
 * lies over the ship. It then writes AVIF and WebP at 768 and 1536 pixels
 * wide (never above the master's width) and a 720 pixel wide phone crop.
 */

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'components',
  'front-page',
  'hero',
);
export const MASTER = join(DIR, 'meridian-hero-master.png');

/** The flat ground of the master, and the `space` token it becomes. */
const GROUND = [15, 22, 29];
const SPACE = [7, 11, 18];
/** Colour distance under which a border-connected pixel counts as ground. */
const REACH = 12;
const SEED = 0x4d455244;
const STARS = 170;

export const WIDTHS = [768, 1536];
/** The phone crop: the hull and the engines, in master pixels (x, y, width, height). */
export const PHONE_CROP = { left: 190, top: 170, width: 1346, height: 580 };
export const PHONE_WIDTH = 720;

/** mulberry32, so the starfield is the same on every run. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The master with its ground replaced by space and stars, as raw RGB. */
export async function bake(path = MASTER) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const ground = new Uint8Array(width * height);
  const near = (at) => {
    const dr = data[at * 3] - GROUND[0];
    const dg = data[at * 3 + 1] - GROUND[1];
    const db = data[at * 3 + 2] - GROUND[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) < REACH;
  };

  const stack = [];
  const push = (x, y) => {
    const at = y * width + x;
    if (!ground[at] && near(at)) {
      ground[at] = 1;
      stack.push(at);
    }
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const at = stack.pop();
    const x = at % width;
    const y = (at - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  const out = Buffer.from(data);
  for (let at = 0; at < width * height; at += 1) {
    if (ground[at]) {
      out[at * 3] = SPACE[0];
      out[at * 3 + 1] = SPACE[1];
      out[at * 3 + 2] = SPACE[2];
    }
  }

  const clear = (x, y, reach) => {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) return false;
        if (!ground[py * width + px]) return false;
      }
    }
    return true;
  };
  const next = random(SEED);
  const tones = [
    [201, 210, 219],
    [143, 153, 165],
    [107, 118, 132],
  ];
  for (let placed = 0; placed < STARS;) {
    const x = 1 + Math.floor(next() * (width - 2));
    const y = 1 + Math.floor(next() * (height - 2));
    const big = next() < 0.12;
    const tone = tones[Math.floor(next() * tones.length)];
    if (!clear(x, y, big ? 8 : 4)) continue;
    const size = big ? 2 : 1;
    for (let dy = 0; dy < size; dy += 1) {
      for (let dx = 0; dx < size; dx += 1) {
        const at = ((y + dy) * width + x + dx) * 3;
        out[at] = tone[0];
        out[at + 1] = tone[1];
        out[at + 2] = tone[2];
      }
    }
    placed += 1;
  }
  return { data: out, width, height };
}

/** Every file the script writes, with how to cut it from the baked master. */
export function targets() {
  const wide = WIDTHS.map((width) => ({
    name: `meridian-hero-${width}`,
    width,
  }));
  return [
    ...wide,
    {
      name: `meridian-hero-phone-${PHONE_WIDTH}`,
      width: PHONE_WIDTH,
      crop: PHONE_CROP,
    },
  ];
}

async function main() {
  const baked = await bake();
  const source = () =>
    sharp(baked.data, {
      raw: { width: baked.width, height: baked.height, channels: 3 },
    });
  for (const target of targets()) {
    if (target.width > (target.crop?.width ?? baked.width)) {
      throw new Error(`${target.name} would upscale the master`);
    }
    let image = source();
    if (target.crop) image = image.extract(target.crop);
    image = image.resize({ width: target.width, withoutEnlargement: true });
    const avif = await image
      .clone()
      .avif({ quality: 52, effort: 8 })
      .toBuffer();
    const webp = await image
      .clone()
      .webp({ quality: 80, effort: 6 })
      .toBuffer();
    const { default: fs } = await import('node:fs/promises');
    await fs.writeFile(join(DIR, `${target.name}.avif`), avif);
    await fs.writeFile(join(DIR, `${target.name}.webp`), webp);
    console.log(`${target.name}: avif ${avif.length} B, webp ${webp.length} B`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
