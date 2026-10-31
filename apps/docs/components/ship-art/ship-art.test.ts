// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  PIPE_KEY,
  SCREEN,
  VIEWS,
  bake,
  bakeHash,
  geometryHash,
  isPipeHue,
  masterOf,
  pipeBand,
  project,
  readGeometry,
  saturation,
} from '../../tools/ship-art.mjs';

interface Sidecar {
  view: string;
  size?: { width: number; height: number };
  pixelsPerMetre?: number;
  origin?: [number, number];
  frame?: string;
  camera?: unknown;
  source: string;
  bake: string;
  geometry?: string;
}

const read = (view: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, view, `${view}.json`), 'utf8'),
  ) as Sidecar;

describe('the ship art sidecars (design system 8.3)', () => {
  it('has a master and a sidecar for every view', () => {
    for (const view of Object.keys(VIEWS)) {
      const dir = join(import.meta.dirname, view);
      expect(existsSync(join(dir, `meridian-${view}-master.png`)), view).toBe(
        true,
      );
      expect(existsSync(join(dir, `${view}.json`)), view).toBe(true);
    }
  });

  it('records the camera of the two side views and the geometry they paint', () => {
    for (const view of ['cutaway', 'side']) {
      expect(read(view)).toMatchObject({
        view,
        size: { width: 2048, height: 512 },
        pixelsPerMetre: 25.6,
        origin: [128, 448],
        frame: '-5 0 80 20',
      });
    }
  });

  it('gives the hero a view and a camera and no geometry', () => {
    const hero = read('hero');
    expect(hero.view).toBe('hero');
    expect(hero.camera).toBeDefined();
    expect(hero.geometry).toBeUndefined();
  });

  it.each(['cutaway', 'side'])(
    'the %s sidecar carries the hash of the geometry it was painted from',
    (view) => {
      expect(
        read(view).geometry,
        'the geometry changed: repaint or re-register the cutaway',
      ).toBe(geometryHash());
    },
  );

  it.each(Object.keys(VIEWS))(
    'the %s sidecar carries the hash of the bake that wrote its files',
    (view) => {
      expect(
        read(view).bake,
        'a bake parameter or a master changed: run tools/ship-art.mjs and commit the result',
      ).toBe(bakeHash(view));
    },
  );

  it('names the paint pass and no path', () => {
    for (const view of Object.keys(VIEWS)) {
      expect(read(view).source).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('the registration of the frame on the art', () => {
  /** The pixel of a point of the ship through the viewBox of the sidecar. */
  const pixelOf = (view: string, x: number, z: number) => {
    const sidecar = read(view);
    const [vx, vy, vw, vh] = (sidecar.frame ?? '').split(' ').map(Number);
    const [, y] = project(x, z);
    // The schematic writes y as 17.5 - z, which is v / 25.6.
    const svgY = y / 25.6;
    return [
      ((x - (vx ?? 0)) / (vw ?? 1)) * (sidecar.size?.width ?? 0),
      ((svgY - (vy ?? 0)) / (vh ?? 1)) * (sidecar.size?.height ?? 0),
    ] as const;
  };

  it.each(['cutaway', 'side'])(
    'puts the origin of the %s sidecar where x = 0 and z = 0 project',
    (view) => {
      const [u, v] = pixelOf(view, 0, 0);
      expect([u, v]).toEqual(read(view).origin);
    },
  );

  it('projects the keel (z = 0) to row 448, where the side master ends its hull', async () => {
    const [u, v] = pixelOf('side', 32, 0);
    expect(v).toBe(448);
    const { data, info } = await sharp(masterOf('side'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ground = (y: number) => {
      const at = (y * info.width + Math.round(u)) * 3;
      const d =
        Math.abs((data[at] ?? 0) - 10) +
        Math.abs((data[at + 1] ?? 0) - 15) +
        Math.abs((data[at + 2] ?? 0) - 19);
      return d < 12;
    };
    // The hull is there three rows above the keel and the ground four rows below.
    expect(ground(v - 3)).toBe(false);
    expect(ground(v + 4)).toBe(true);
  });
});

describe('the painted pipes (tech lead TL14)', () => {
  const W = 2048;
  const H = 512;

  /** Pipe-hued pixels of an image inside a band of 15 pixels around each conduit path. */
  async function hued(data: Uint8Array | Buffer) {
    const band = await pipeBand(readGeometry(), W, H, 15);
    let inBand = 0;
    let found = 0;
    for (let at = 0; at < W * H; at += 1) {
      if (!band[at]) continue;
      inBand += 1;
      if (
        isPipeHue(
          data[at * 3] ?? 0,
          data[at * 3 + 1] ?? 0,
          data[at * 3 + 2] ?? 0,
        )
      ) {
        found += 1;
      }
    }
    return { inBand, found };
  }

  it('finds painted pipes in the master, so the count below can fail', async () => {
    const { data } = await sharp(masterOf('cutaway'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { found } = await hued(data);
    expect(found).toBeGreaterThan(10_000);
  }, 60_000);

  // The test reads the bake. A lossy codec moves
  // the ground colour (saturation 0.48) across 0.5. The pipe mask is 9 pixels
  // wide and the painted pipes are a little wider, so a few edge pixels keep
  // their hue, and the test allows 0.1% of the band. The bake left 14 of
  // 122,832. The bake grades the rooms, so a room hue does not count here:
  // set `roomSaturation` back to 1 and this count would follow the paint.
  it('leaves at most 0.1% of the band around the conduits with a pipe hue', async () => {
    const baked = await bake('cutaway');
    const { inBand, found } = await hued(baked.data);
    expect(inBand).toBeGreaterThan(100_000);
    expect(found).toBeLessThanOrEqual(Math.floor(inBand * 0.001));
  }, 60_000);

  it('keys by a saturation below the limit of the test', () => {
    expect(PIPE_KEY).toBeLessThan(0.5);
    expect(
      saturation(SCREEN[0] ?? 0, SCREEN[1] ?? 0, SCREEN[2] ?? 0),
    ).toBeLessThan(0.5);
  });
});
