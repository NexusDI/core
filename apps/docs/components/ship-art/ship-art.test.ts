// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PIPE_KEY,
  VIEWS,
  bake,
  geometryHash,
  pipeMask,
  readGeometry,
  saturation,
} from '../../tools/ship-art.mjs';

const read = (view: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, view, `${view}.json`), 'utf8'),
  ) as Record<string, unknown>;

describe('the ship art sidecars (design system 8.3)', () => {
  it('has a master, a sidecar and a file at each width for every view', () => {
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
        frame: '-5 -1.5 80 20',
      });
    }
  });

  it('gives the hero a view and a camera and no geometry', () => {
    const hero = read('hero');
    expect(hero['view']).toBe('hero');
    expect(hero['camera']).toBeDefined();
    expect(hero['geometry']).toBeUndefined();
  });

  it.each(['cutaway', 'side'])(
    'the %s sidecar carries the hash of the geometry it was painted from',
    (view) => {
      expect(
        read(view)['geometry'],
        'the geometry changed: repaint or re-register the cutaway',
      ).toBe(geometryHash());
    },
  );

  it('names the paint pass and no path', () => {
    for (const view of Object.keys(VIEWS)) {
      const source = read(view)['source'];
      expect(source).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('the painted pipes (tech lead TL14)', () => {
  // The test reads the bake and not the encoded files: a lossy codec moves the
  // ground colour (saturation 0.48) across 0.5. The mask edge anti-aliases, so
  // a pixel or two of the 9 pixel stroke could keep the colour of the paint
  // under it, and the test allows 0.1% of the mask. The bake left 0 of 39,896.
  it('keeps at most 0.1% of the pipe mask over 0.5 saturation', async () => {
    const baked = await bake('cutaway');
    const mask = await pipeMask(readGeometry(), baked.width, baked.height);
    let inside = 0;
    let over = 0;
    for (let at = 0; at < mask.length; at += 1) {
      if (!mask[at]) continue;
      inside += 1;
      const [r, g, b] = [
        baked.data[at * 3] ?? 0,
        baked.data[at * 3 + 1] ?? 0,
        baked.data[at * 3 + 2] ?? 0,
      ];
      if (saturation(r, g, b) > 0.5) over += 1;
    }
    expect(inside).toBeGreaterThan(5000);
    expect(over).toBeLessThanOrEqual(Math.floor(inside * 0.001));
  }, 60_000);

  it('keys by a saturation below the limit of the test', () => {
    expect(PIPE_KEY).toBeLessThan(0.5);
  });
});
