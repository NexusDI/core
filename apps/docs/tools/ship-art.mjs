import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { screen } from '@nexusdi/meridian-ui/tokens';

/**
 * Bakes the painted ship art (site UX spec 4.2, 4.3, 4.8 and 12.2; design
 * system 8.1 and 8.3). Run by hand with `node tools/ship-art.mjs [view]` after
 * a master or the geometry changes; the outputs are committed and the docs
 * build never runs the script.
 *
 * Each view lives in `components/ship-art/<view>/` with its PNG master, the
 * AVIF and WebP files and a `<view>.json` sidecar. Every view takes the same
 * first step: the master's ground, found by a flood fill from the border,
 * becomes the `screen` token, so the art sits on the screens of the page
 * with no seam. Widths are 1024, 1536 and 2048 and never pass the master's
 * width.
 *
 * The cutaway has two more steps. The painted pipes (37 of them: power,
 * coolant and atmosphere) never read as the page's dependency conduits, which
 * follow the placement routes (tech lead TL14), so a pipe mask, the geometry's
 * conduit paths projected 9 pixels wide, ANDed with a chroma key, turns each
 * painted pipe to grey at 55% of its luminance. And the rooms take a grade
 * (`roomSaturation`), since painted rooms carry hues the design system keeps
 * for meaning (TL15). The owner decides the grade: 1 leaves the paint alone.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ART_DIR = join(ROOT, 'components', 'ship-art');
export const GEOMETRY_FILE = join(
  ROOT,
  '..',
  '..',
  'examples',
  'meridian-systems',
  'deck',
  'meridian.geometry.json',
);

/** The orthographic camera of the side views: 25.6 pixels per metre. */
export const PIXELS_PER_METRE = 25.6;
export const FRAME = '-5 0 80 20';
const ORIGIN = [128, 448];
/** u = (x + 5) * 25.6 and v = (17.5 - z) * 25.6, in metres. */
export const project = (x, z) => [(x + 5) * 25.6, (17.5 - z) * 25.6];

/** Pipes keyed by chroma: HSV saturation over this (90 of 255), and grey at this share of luminance. */
export const PIPE_KEY = 90 / 255;
export const PIPE_LUMINANCE = 0.55;
export const PIPE_WIDTH = 9;

const REACH = 12;
const SEED = 0x4d455244;
const STARS = 170;
const WIDTHS = [1024, 1536, 2048];

/**
 * The views. `ground` is the master's flat ground, `pass` the id of the paint
 * pass the master came from (no path), `avif` the AVIF quality.
 */
export const VIEWS = {
  hero: {
    ground: [15, 22, 29],
    pass: 'hero-ext-d-s211-i20-d-clip',
    avif: 52,
    stars: true,
    crop: {
      name: 'phone-720',
      left: 190,
      top: 170,
      width: 1346,
      height: 580,
      to: 720,
    },
  },
  cutaway: {
    ground: [13, 13, 12],
    pass: 'cutaway-cut-a-s211-h375',
    avif: 64,
    pipes: true,
    roomSaturation: 0.3,
    camera: true,
  },
  side: {
    ground: [10, 15, 19],
    pass: 'side-ext-d-s211-h25-d-clip',
    avif: 52,
    camera: true,
  },
};

const hex = (value) =>
  [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
export const SCREEN = hex(screen.screen);

export function readGeometry() {
  return JSON.parse(readFileSync(GEOMETRY_FILE, 'utf8'));
}

/** The sha256 of the parts of the geometry that the cutaway paints. */
export function geometryHash(geometry = readGeometry()) {
  const { hull, compartments, doors, conduits } = geometry;
  return createHash('sha256')
    .update(JSON.stringify({ hull, compartments, doors, conduits }))
    .digest('hex');
}

export const viewDir = (view) => join(ART_DIR, view);
export const masterOf = (view) =>
  join(viewDir(view), `meridian-${view}-master.png`);

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

/** A raster of the shapes `svg` draws in white on black, as one byte per pixel. */
async function shapes(width, height, svg, blur = 0) {
  let image = sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>${svg}</svg>`,
    ),
  )
    .removeAlpha()
    .greyscale();
  if (blur > 0) image = image.blur(blur);
  return image.raw().toBuffer();
}

/** The geometry's conduit paths, projected and drawn 9 pixels wide. */
export async function pipeMask(geometry, width, height) {
  const lines = geometry.conduits
    .map((conduit) => {
      const points = conduit.path
        .map(([x, , z]) => project(x, z).join(','))
        .join(' ');
      return `<polyline points="${points}" fill="none" stroke="white" stroke-width="${PIPE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join('');
  const raster = await shapes(width, height, lines);
  return Uint8Array.from(raster, (value) => (value > 64 ? 1 : 0));
}

/**
 * A band around each conduit path, `reach` pixels to either side, as one flag
 * per pixel. Where the pipe mask covers the painted pipes, no painted pipe is
 * left in the band.
 */
export async function pipeBand(geometry, width, height, reach) {
  const lines = geometry.conduits
    .map((conduit) => {
      const points = conduit.path
        .map(([x, , z]) => project(x, z).join(','))
        .join(' ');
      return `<polyline points="${points}" fill="none" stroke="white" stroke-width="${reach * 2 + 1}" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join('');
  const raster = await shapes(width, height, lines);
  return Uint8Array.from(raster, (value) => (value > 128 ? 1 : 0));
}

/** HSV hue in degrees, 0 for a grey. */
export function hue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r
      ? ((g - b) / d) * 60
      : max === g
        ? (2 + (b - r) / d) * 60
        : (4 + (r - g) / d) * 60;
  return h < 0 ? h + 360 : h;
}

/** Whether a colour has the hue of a painted pipe: yellow, green or cyan, and saturated. */
export function isPipeHue(r, g, b) {
  if (saturation(r, g, b) <= 0.5) return false;
  const h = hue(r, g, b);
  return (
    (h >= 35 && h <= 70) || (h >= 80 && h <= 160) || (h >= 165 && h <= 205)
  );
}

/** The room rectangles, softened by one pixel, as 0 to 255. */
async function roomMask(geometry, width, height) {
  const rects = geometry.compartments
    .flatMap((room) => room.boxes)
    .map((box) => {
      const [x0, v0] = project(box.x[0], box.z[1]);
      const [x1, v1] = project(box.x[1], box.z[0]);
      return `<rect x="${x0}" y="${v0}" width="${x1 - x0}" height="${v1 - v0}" fill="white"/>`;
    })
    .join('');
  return shapes(width, height, rects, 1);
}

/** HSV saturation, 0 to 1. */
export function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/** The ground by a flood fill from the border, as one flag per pixel. */
function groundOf(data, width, height, ground) {
  const flags = new Uint8Array(width * height);
  const near = (at) => {
    const dr = data[at * 3] - ground[0];
    const dg = data[at * 3 + 1] - ground[1];
    const db = data[at * 3 + 2] - ground[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) < REACH;
  };
  const stack = [];
  const push = (x, y) => {
    const at = y * width + x;
    if (!flags[at] && near(at)) {
      flags[at] = 1;
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
  return flags;
}

/** A static starfield on ground pixels only, so no star lies over the ship. */
function addStars(out, ground, width, height) {
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
}

/** The master of `view` after every step of its row, as raw RGB. */
export async function bake(view, options = {}) {
  const row = { ...VIEWS[view], ...options };
  const { data, info } = await sharp(masterOf(view))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.from(data);

  const ground = groundOf(data, width, height, row.ground);
  for (let at = 0; at < width * height; at += 1) {
    if (ground[at]) {
      out[at * 3] = SCREEN[0];
      out[at * 3 + 1] = SCREEN[1];
      out[at * 3 + 2] = SCREEN[2];
    }
  }
  if (row.stars) addStars(out, ground, width, height);

  if (row.pipes) {
    const geometry = readGeometry();
    const mask = await pipeMask(geometry, width, height);
    const keyed = new Float32Array(width * height);
    for (let at = 0; at < mask.length; at += 1) {
      if (!mask[at]) continue;
      const [r, g, b] = [out[at * 3], out[at * 3 + 1], out[at * 3 + 2]];
      if (saturation(r, g, b) > PIPE_KEY) keyed[at] = 1;
    }
    // The key keeps its full strength, and the blur only softens the edge outward.
    const soft = await sharp(Buffer.from(keyed.map((value) => value * 255)), {
      raw: { width, height, channels: 1 },
    })
      .blur(0.8)
      .raw()
      .toBuffer();
    for (let at = 0; at < width * height; at += 1) {
      const k = Math.max(soft[at] / 255, keyed[at]);
      if (k === 0) continue;
      const luminance =
        0.299 * out[at * 3] + 0.587 * out[at * 3 + 1] + 0.114 * out[at * 3 + 2];
      for (let c = 0; c < 3; c += 1) {
        out[at * 3 + c] = Math.round(
          out[at * 3 + c] * (1 - k) + luminance * PIPE_LUMINANCE * k,
        );
      }
    }

    if (row.roomSaturation !== undefined && row.roomSaturation !== 1) {
      const rooms = await roomMask(geometry, width, height);
      for (let at = 0; at < width * height; at += 1) {
        const r = rooms[at] / 255;
        if (r === 0) continue;
        const luminance =
          0.299 * out[at * 3] +
          0.587 * out[at * 3 + 1] +
          0.114 * out[at * 3 + 2];
        for (let c = 0; c < 3; c += 1) {
          const value = out[at * 3 + c];
          const graded = luminance + (value - luminance) * row.roomSaturation;
          out[at * 3 + c] = Math.round(
            Math.min(255, Math.max(0, value * (1 - r) + graded * r)),
          );
        }
      }
    }
  }
  return { data: out, width, height };
}

/**
 * The sha256 of everything a bake reads: the view's row, the constants of the
 * steps, the master's bytes and, for the cutaway, the geometry. A sidecar
 * carries it, and a test fails when a parameter changed with no rebake.
 */
export function bakeHash(view) {
  const row = VIEWS[view];
  return createHash('sha256')
    .update(
      JSON.stringify({
        view,
        row,
        screen: SCREEN,
        steps: {
          REACH,
          SEED,
          STARS,
          WIDTHS,
          PIPE_KEY,
          PIPE_LUMINANCE,
          PIPE_WIDTH,
        },
        master: createHash('sha256')
          .update(readFileSync(masterOf(view)))
          .digest('hex'),
        geometry: row.pipes ? geometryHash() : null,
      }),
    )
    .digest('hex');
}

/** The sidecar of a view (design system 8.3). */
export function sidecarOf(view, size) {
  const row = VIEWS[view];
  if (!row.camera) {
    return {
      view,
      camera: { projection: 'perspective' },
      source: row.pass,
      bake: bakeHash(view),
    };
  }
  return {
    view,
    size,
    pixelsPerMetre: PIXELS_PER_METRE,
    origin: ORIGIN,
    frame: FRAME,
    camera: {
      projection: 'orthographic',
      u: '(x + 5) * 25.6',
      v: '(17.5 - z) * 25.6',
    },
    source: row.pass,
    bake: bakeHash(view),
    geometry: geometryHash(),
  };
}

async function main() {
  const wanted = process.argv[2];
  for (const view of Object.keys(VIEWS)) {
    if (wanted && wanted !== view) continue;
    const row = VIEWS[view];
    const baked = await bake(view);
    const source = () =>
      sharp(baked.data, {
        raw: { width: baked.width, height: baked.height, channels: 3 },
      });
    const targets = [
      ...WIDTHS.filter((width) => width <= baked.width).map((width) => ({
        name: `meridian-${view}-${width}`,
        width,
      })),
      ...(row.crop
        ? [
            {
              name: `meridian-${view}-${row.crop.name}`,
              width: row.crop.to,
              crop: row.crop,
            },
          ]
        : []),
    ];
    for (const target of targets) {
      let image = source();
      if (target.crop) {
        const { left, top, width, height } = target.crop;
        image = image.extract({ left, top, width, height });
      }
      image = image.resize({ width: target.width, withoutEnlargement: true });
      const avif = await image
        .clone()
        .avif({ quality: row.avif, effort: 8 })
        .toBuffer();
      const webp = await image
        .clone()
        .webp({ quality: 80, effort: 6 })
        .toBuffer();
      writeFileSync(join(viewDir(view), `${target.name}.avif`), avif);
      writeFileSync(join(viewDir(view), `${target.name}.webp`), webp);
      console.log(
        `${target.name}: avif ${avif.length} B, webp ${webp.length} B`,
      );
    }
    writeFileSync(
      join(viewDir(view), `${view}.json`),
      `${JSON.stringify(sidecarOf(view, { width: baked.width, height: baked.height }), null, 2)}\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
