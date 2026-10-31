import { describe, expect, it } from 'vitest';

import type { DeckChange } from '../state/contracts.js';

import {
  ALARM_LAMP,
  ALARM_LOW,
  AMBIENT_ALARM,
  AMBIENT_POWERED,
  AMBIENT_UNPOWERED,
  LevelTrack,
  LightModel,
  LAMP_GAIN,
  REACH,
  STANDBY_GLOW,
  falloff,
  fixtureTarget,
  hexToInt,
  lightLevel,
  pulse,
  radialPixels,
  rampValue,
  roomTarget,
  spriteSize,
  tintOf,
} from './light-math.js';

const change = (patch: DeckChange['patch']): DeckChange => ({
  patch,
  snapshot: { rooms: {}, fixtures: {} },
});

describe('the room and fixture targets', () => {
  it('lights a powered room with lamps and a dim ambient', () => {
    expect(roomTarget('powered')).toEqual({
      ambient: AMBIENT_POWERED,
      lamp: 1,
      alarm: 0,
    });
  });

  it('darkens an unpowered room to a lower ambient with no lamp', () => {
    expect(roomTarget('unpowered')).toEqual({
      ambient: AMBIENT_UNPOWERED,
      lamp: 0,
      alarm: 0,
    });
    expect(AMBIENT_UNPOWERED).toBeLessThan(AMBIENT_POWERED);
  });

  it('dims the lamps of an alarmed room and adds the alarm light', () => {
    expect(roomTarget('alarm')).toEqual({
      ambient: AMBIENT_ALARM,
      lamp: ALARM_LAMP,
      alarm: 1,
    });
  });

  it('treats a state it does not know as dark', () => {
    expect(roomTarget('flooded' as never)).toEqual(roomTarget('unpowered'));
  });

  it('gives an online fixture its full glow, a standby one half, and an offline one none', () => {
    expect(fixtureTarget('online')).toBe(1);
    expect(fixtureTarget('standby')).toBe(STANDBY_GLOW);
    expect(fixtureTarget('offline')).toBe(0);
    expect(fixtureTarget('melted' as never)).toBe(0);
  });
});

describe('the alarm pulse', () => {
  it('peaks at 100% and falls to 70% half a second later', () => {
    expect(pulse(0, false)).toBeCloseTo(1, 10);
    expect(pulse(500, false)).toBeCloseTo(ALARM_LOW, 10);
    expect(ALARM_LOW).toBe(0.7);
  });

  it('repeats once a second', () => {
    expect(pulse(1000, false)).toBeCloseTo(1, 10);
    expect(pulse(1250, false)).toBeCloseTo(pulse(250, false), 10);
  });

  it('holds steady at the peak under reduced motion', () => {
    for (const time of [0, 250, 500, 750]) {
      expect(pulse(time, true)).toBe(1);
    }
  });
});

describe('the ramp', () => {
  const ramp = { delay: 100, duration: 200 };

  it('holds the start until the delay has passed', () => {
    expect(rampValue(0, 1, 0, ramp)).toBe(0);
    expect(rampValue(0, 1, 100, ramp)).toBe(0);
  });

  it('moves linearly over its duration and then holds the target', () => {
    expect(rampValue(0, 1, 200, ramp)).toBeCloseTo(0.5, 10);
    expect(rampValue(0, 1, 300, ramp)).toBe(1);
    expect(rampValue(0, 1, 900, ramp)).toBe(1);
  });

  it('jumps at once when the duration is zero', () => {
    expect(rampValue(0, 1, 1, { delay: 0, duration: 0 })).toBe(1);
  });

  it('starts a new ramp from the value the track has reached', () => {
    const track = new LevelTrack(0);
    track.set(1, 0, { delay: 0, duration: 100 });
    expect(track.value(50)).toBeCloseTo(0.5, 10);
    track.set(0, 50, { delay: 0, duration: 100 });
    expect(track.value(50)).toBeCloseTo(0.5, 10);
    expect(track.value(100)).toBeCloseTo(0.25, 10);
    expect(track.settled(149)).toBe(false);
    expect(track.settled(150)).toBe(true);
  });
});

describe('the light model', () => {
  const build = (reducedMotion: boolean) =>
    new LightModel(
      ['bridge', 'airlock'],
      ['bridge.console'],
      reducedMotion,
      100,
    );

  it('starts every room powered and every fixture online, settled', () => {
    const model = build(false);
    expect(model.room('bridge', 0)).toMatchObject({
      ambient: AMBIENT_POWERED,
      lamp: 1,
    });
    expect(model.fixture('bridge.console', 0)).toBe(1);
    expect(model.animating(0)).toBe(false);
  });

  it('ramps a room to unpowered over the default ramp and settles', () => {
    const model = build(false);
    model.apply(change({ rooms: { bridge: 'unpowered' } }), 0);
    expect(model.animating(10)).toBe(true);
    expect(model.room('bridge', 50)?.lamp).toBeCloseTo(0.5, 10);
    expect(model.room('bridge', 100)?.lamp).toBe(0);
    expect(model.animating(100)).toBe(false);
  });

  it('takes the ramp of a patch over the default, for the launch sequence', () => {
    const model = build(false);
    model.apply(change({ rooms: { bridge: 'unpowered' } }), 0);
    model.apply(
      change({
        rooms: { bridge: 'powered' },
        ramp: { delay: 120, duration: 120 },
      }),
      200,
    );
    expect(model.room('bridge', 300)?.lamp).toBe(0);
    expect(model.room('bridge', 380)?.lamp).toBeCloseTo(0.5, 10);
    expect(model.room('bridge', 440)?.lamp).toBe(1);
  });

  it('pulses the alarm channel of an alarmed room and keeps the frames coming', () => {
    const model = build(false);
    model.apply(change({ rooms: { airlock: 'alarm' } }), 0);
    expect(model.animating(10_000)).toBe(true);
    expect(model.room('airlock', 10_000)?.alarm).toBeCloseTo(1, 10);
    expect(model.room('airlock', 10_500)?.alarm).toBeCloseTo(ALARM_LOW, 10);
    expect(model.room('bridge', 10_500)?.alarm).toBe(0);
  });

  it('applies every change at once and holds the alarm steady under reduced motion', () => {
    const model = build(true);
    model.apply(
      change({ rooms: { airlock: 'alarm', bridge: 'unpowered' } }),
      0,
    );
    expect(model.room('bridge', 0)?.lamp).toBe(0);
    expect(model.room('airlock', 0)?.alarm).toBe(1);
    expect(model.room('airlock', 500)?.alarm).toBe(1);
    expect(model.animating(500)).toBe(false);
  });

  it('turns an offline fixture off and ignores an id it does not hold', () => {
    const model = build(true);
    model.apply(
      change({ fixtures: { 'bridge.console': 'offline', ghost: 'online' } }),
      0,
    );
    expect(model.fixture('bridge.console', 0)).toBe(0);
    expect(model.fixture('ghost', 0)).toBeUndefined();
    expect(model.room('nowhere', 0)).toBeUndefined();
  });
});

describe('the levels of a light', () => {
  const room = { ambient: 0.35, lamp: 0.5, alarm: 0 };

  it('follows the fixture a light names', () => {
    expect(lightLevel({ fixture: 'bridge.console' }, room, 0.25)).toBe(0.25);
  });

  it('follows the room lamp channel when the light names no fixture', () => {
    expect(lightLevel({ fixture: null }, room, undefined)).toBe(0.5);
  });

  it('follows the room when the fixture is unknown to the model, and goes dark with no room', () => {
    expect(lightLevel({ fixture: 'ghost' }, room, undefined)).toBe(0.5);
    expect(lightLevel({ fixture: null }, undefined, undefined)).toBe(0);
  });
});

describe('the tuned constants', () => {
  it('start from the mock: lamps at 72% reaching 1.5 times the radius', () => {
    expect(LAMP_GAIN).toBe(0.72);
    expect(REACH).toBe(1.5);
  });
});

describe('the tint and the sprite', () => {
  const palette = { lamp: '#e8b46a', glow: '#dfe6ea', alarm: '#ff0000' };

  it('reads a hex colour', () => {
    expect(hexToInt('#e8b46a')).toBe(0xe8b46a);
  });

  it('tints a light with the palette colour it names and falls back to the lamp for another name', () => {
    expect(tintOf('glow', palette)).toBe(0xdfe6ea);
    expect(tintOf('alarm', palette)).toBe(0xff0000);
    expect(tintOf('ultraviolet', palette)).toBe(0xe8b46a);
    expect(tintOf('toString', palette)).toBe(0xe8b46a);
  });

  it('sizes a sprite as the housing width plus the reach on each side', () => {
    expect(spriteSize({ radius: 64, box: [273.9, 340.5, 289.3, 343] })).toEqual(
      {
        width: 289.3 - 273.9 + 2 * 64 * REACH,
        height: 2 * 64 * REACH,
      },
    );
  });

  it('falls off smoothly from 1 at the centre to 0 at the edge', () => {
    expect(falloff(0)).toBe(1);
    expect(falloff(1)).toBe(0);
    expect(falloff(0.5)).toBeCloseTo(0.5, 10);
    expect(falloff(0.25)).toBeGreaterThan(falloff(0.75));
  });

  it('fills a premultiplied square that is brightest in the middle and clear at the corners', () => {
    const size = 33;
    const pixels = radialPixels(size);
    const at = (x: number, y: number) => (y * size + x) * 4;
    expect(pixels).toHaveLength(size * size * 4);
    expect(pixels[at(16, 16)]).toBe(255);
    expect(pixels[at(0, 0)]).toBe(0);
    const c = at(10, 16);
    expect(pixels[c]).toBe(pixels[c + 3]);
  });
});
