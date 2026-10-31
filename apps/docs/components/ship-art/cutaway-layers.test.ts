// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

interface Light {
  ids: string[];
  room: string;
  home: string;
  gain: number;
  kind: string;
  colour: string;
  fixture: string | null;
  emissive: boolean;
  centre: [number, number];
  radius: number;
  box: [number, number, number, number];
}

interface Legend {
  size: { width: number; height: number };
  frame: string;
  pixelsPerMetre: number;
  space: number;
  structure: number;
  rooms: Record<string, number>;
  bounds: Record<string, [number, number, number, number]>;
}

interface Geometry {
  compartments: { id: string; fixtures: { id: string }[] }[];
  lights: {
    id: string;
    room: string;
    emissive: boolean;
    x: [number, number];
    z: [number, number];
    radius: number;
  }[];
}

const dir = join(import.meta.dirname, 'cutaway');
const json = <T>(name: string) =>
  JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
const lights = json<Light[]>('meridian-cutaway-lights.json');
const legend = json<Legend>('meridian-cutaway-rooms.legend.json');
const geometry = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '../../../../examples/meridian-systems/deck/meridian.geometry.json',
    ),
    'utf8',
  ),
) as Geometry;

const grey = async (name: string) => {
  const { data, info } = await sharp(join(dir, name))
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
};

describe('the cutaway layers (design system 8.2 and 8.3)', () => {
  it('lists the rooms in geometry order from index 2, after space and structure', () => {
    expect(legend.space).toBe(0);
    expect(legend.structure).toBe(1);
    expect(Object.keys(legend.rooms)).toEqual(
      geometry.compartments.map((room) => room.id),
    );
    expect(Object.values(legend.rooms)).toEqual(
      geometry.compartments.map((_, at) => at + 2),
    );
    expect(legend.frame).toBe('-5 0 80 20');
    expect(legend.pixelsPerMetre).toBe(25.6);
  });

  it('writes the room mask as one 8-bit grey channel on the 2048 by 512 frame', async () => {
    const { data, info } = await grey('meridian-cutaway-rooms.png');
    expect([info.width, info.height, info.channels]).toEqual([2048, 512, 1]);
    const seen = new Set(data);
    expect([...seen].sort((a, b) => a - b)).toEqual([
      0,
      1,
      ...Object.values(legend.rooms),
    ]);
  });

  it('keeps each room inside the bounds the legend lists, and each bound holds its room', async () => {
    const { data, info } = await grey('meridian-cutaway-rooms.png');
    for (const [room, index] of Object.entries(legend.rooms)) {
      const [left, top, right, bottom] = legend.bounds[room] ?? [0, 0, 0, 0];
      let found = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          if (data[y * info.width + x] !== index) continue;
          found += 1;
          expect(x >= left && x < right && y >= top && y < bottom, room).toBe(
            true,
          );
        }
      }
      expect(found, room).toBeGreaterThan(500);
    }
  });

  it('puts every light of the geometry in the lights file, port and starboard pairs merged', () => {
    expect(lights.flatMap((light) => light.ids).sort()).toEqual(
      geometry.lights.map((light) => light.id).sort(),
    );
    expect(lights.length).toBeLessThan(geometry.lights.length);
    for (const light of lights) {
      expect(legend.rooms[light.room], light.ids.join()).toBeDefined();
    }
  });

  it('places a light by u = (x + 5) * 25.6 and v = (17.5 - z) * 25.6', () => {
    const source = geometry.lights.find(
      (each) => each.id === 'computer-core.lamp',
    );
    const light = lights.find((each) =>
      each.ids.includes('computer-core.lamp'),
    );
    expect(source && light).toBeTruthy();
    if (!source || !light) return;
    expect(light.box[0]).toBeCloseTo((source.x[0] + 5) * 25.6, 1);
    expect(light.box[2]).toBeCloseTo((source.x[1] + 5) * 25.6, 1);
    expect(light.box[1]).toBeCloseTo((17.5 - source.z[1]) * 25.6, 1);
    expect(light.box[3]).toBeCloseTo((17.5 - source.z[0]) * 25.6, 1);
    expect(light.radius).toBeCloseTo(source.radius * 25.6, 1);
    expect(light.centre[0]).toBeCloseTo((light.box[0] + light.box[2]) / 2, 1);
  });

  it('puts every light centre and 90% of every housing on the index of its own room', async () => {
    const { data, info } = await grey('meridian-cutaway-rooms.png');
    for (const light of lights) {
      const index = legend.rooms[light.room];
      const [left, top, right, bottom] = light.box;
      const at = (x: number, y: number) => data[y * info.width + x];
      expect(
        at(Math.floor(light.centre[0]), Math.floor(light.centre[1])),
        `${light.ids.join()} centre`,
      ).toBe(index);
      let on = 0;
      let all = 0;
      for (
        let y = Math.floor(top);
        y < Math.max(Math.ceil(bottom), Math.floor(top) + 1);
        y += 1
      ) {
        for (
          let x = Math.floor(left);
          x < Math.max(Math.ceil(right), Math.floor(left) + 1);
          x += 1
        ) {
          all += 1;
          if (at(x, y) === index) on += 1;
        }
      }
      expect(on / all, `${light.ids.join()} housing`).toBeGreaterThanOrEqual(
        0.9,
      );
    }
  });

  it('names the room of the geometry as home, and keeps the habitat strip off the chart room', () => {
    const strip = lights.find((light) =>
      light.ids.includes('habitat.strip-aft'),
    );
    expect(strip?.home).toBe('habitat');
    expect(strip?.room).toBe('habitat');
    const lamp = lights.find((light) => light.ids.includes('chart-room.lamp'));
    expect(lamp?.room).toBe('chart-room');
    for (const light of lights) expect(light.gain).toBeGreaterThan(0);
  });

  it('covers the housing boxes of the emissive lights that name no fixture, and nothing else', async () => {
    const { data, info } = await grey('meridian-cutaway-emissive.png');
    expect([info.width, info.height]).toEqual([2048, 512]);
    const inBox = (x: number, y: number, boxes: Light['box'][]) =>
      boxes.some(
        ([left, top, right, bottom]) =>
          x >= Math.floor(left) - 1 &&
          x <= Math.ceil(right) &&
          y >= Math.floor(top) - 1 &&
          y <= Math.ceil(bottom),
      );
    const boxes = lights
      .filter((light) => light.emissive && light.fixture === null)
      .map((light) => light.box);
    let lit = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[y * info.width + x] === 0) continue;
        lit += 1;
        expect(inBox(x, y, boxes)).toBe(true);
      }
    }
    expect(lit).toBeGreaterThan(1000);
    for (const [left, top, right, bottom] of boxes) {
      const x = Math.round((left + right) / 2);
      const y = Math.floor((top + bottom) / 2);
      // A long strip glows at 45%, so it does not read as a white bar.
      expect(data[y * info.width + x]).toBe(right - left > 128 ? 115 : 255);
    }
  });

  it('leaves the housing of a light that names a fixture out of the mask, since the fixture sets its level', async () => {
    const { data, info } = await grey('meridian-cutaway-emissive.png');
    const named = lights.filter((light) => light.fixture !== null);
    expect(named.length).toBeGreaterThan(0);
    const fixtureIds = geometry.compartments.flatMap((room) =>
      room.fixtures.map((fixture) => fixture.id),
    );
    const lamps = lights.filter(
      (light) => light.fixture === null && light.emissive,
    );
    const overlaps = (a: Light['box'], b: Light['box']) =>
      a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    for (const light of named) {
      expect(fixtureIds, light.ids.join()).toContain(light.fixture);
      if (lamps.some((lamp) => overlaps(lamp.box, light.box))) continue;
      const x = Math.round((light.box[0] + light.box[2]) / 2);
      const y = Math.floor((light.box[1] + light.box[3]) / 2);
      expect(data[y * info.width + x], light.ids.join()).toBe(0);
    }
  });
});
