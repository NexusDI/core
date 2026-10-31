import type {
  DeckChange,
  DeckLight,
  DeckPalette,
  FixtureLight,
  Ramp,
  RoomLight,
} from '../state/contracts.js';

/**
 * The arithmetic of the light, with no Pixi and no clock of its own. Every
 * function takes the time it needs, so a test steps it by hand.
 */

/** The light a room keeps with its lamps off: the unlit base, a little brighter than black. */
export const AMBIENT_UNPOWERED = 0.2;
/** The light a powered room keeps between its lamp pools. */
export const AMBIENT_POWERED = 0.45;
/** An alarmed room keeps a dark ambient and 15% of its lamps, so the red reads over the lamp light. */
export const AMBIENT_ALARM = 0.15;
export const ALARM_LAMP = 0.15;
/**
 * A lamp sprite shows at this share of its room's level. The light texture is
 * a modulation: 0.5 leaves the base as it is, and the composite doubles it, so
 * a lamp's tint can warm a room and the alarm's can turn it red.
 */
export const LAMP_GAIN = 1;
/** The alarm sprite's peak level, which the light sums over two sprites. */
export const ALARM_PEAK = 1.5;
/** The alarm sprite also draws in the emissive pass at this share of its level. */
export const ALARM_GLOW = 0.3;
/** A sprite reaches this many times the radius the lights file lists. */
export const REACH = 1;
/** The alarm light pulses at this rate (design system 9.2). */
export const ALARM_HZ = 1;
/** The pulse falls to this share of its peak (the level the alarm's peak scales). */
export const ALARM_LOW = 0.6;
/** The glow of a fixture that stands by while its section starts. */
export const STANDBY_GLOW = 0.5;
/** The ramp of a change whose patch names none, in milliseconds. */
export const DEFAULT_RAMP_MS = 160;

/** What a room's state asks of each light channel, 0 to 1. */
export interface RoomTarget {
  readonly ambient: number;
  readonly lamp: number;
  readonly alarm: number;
}

/** The channels of a room state. An unknown state is dark, so a source that sends one shows at once. */
export function roomTarget(state: RoomLight): RoomTarget {
  switch (state) {
    case 'powered':
      return { ambient: AMBIENT_POWERED, lamp: 1, alarm: 0 };
    case 'alarm':
      return { ambient: AMBIENT_ALARM, lamp: ALARM_LAMP, alarm: 1 };
    case 'unpowered':
    default:
      return { ambient: AMBIENT_UNPOWERED, lamp: 0, alarm: 0 };
  }
}

/** The glow of a fixture, 0 to 1. An unknown state is off. */
export function fixtureTarget(state: FixtureLight): number {
  switch (state) {
    case 'online':
      return 1;
    case 'standby':
      return STANDBY_GLOW;
    case 'offline':
    default:
      return 0;
  }
}

/**
 * The alarm light's level at `timeMs`: 1 at the peak, `ALARM_LOW` at the
 * trough, one cycle per second. Under reduced motion it holds the peak.
 */
export function pulse(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const phase = 0.5 - 0.5 * Math.cos(2 * Math.PI * ALARM_HZ * (timeMs / 1000));
  return 1 - (1 - ALARM_LOW) * phase;
}

/** The value `elapsed` ms after a ramp started: linear from `from` to `to` once `delay` has passed. */
export function rampValue(
  from: number,
  to: number,
  elapsed: number,
  ramp: Ramp,
): number {
  const into = elapsed - ramp.delay;
  if (into < 0) return from;
  if (ramp.duration <= 0 || into >= ramp.duration) return to;
  return from + (to - from) * (into / ramp.duration);
}

/** One light channel moving toward a target. */
export class LevelTrack {
  private from: number;
  private to: number;
  private start = 0;
  private ramp: Ramp = { delay: 0, duration: 0 };

  constructor(initial: number) {
    this.from = initial;
    this.to = initial;
  }

  /** Starts a ramp from wherever the channel is at `now`. */
  set(target: number, now: number, ramp: Ramp): void {
    this.from = this.value(now);
    this.to = target;
    this.start = now;
    this.ramp = ramp;
  }

  value(now: number): number {
    return rampValue(this.from, this.to, now - this.start, this.ramp);
  }

  settled(now: number): boolean {
    return now - this.start >= this.ramp.delay + this.ramp.duration;
  }

  get target(): number {
    return this.to;
  }
}

/** The levels of one room at one moment. */
export interface RoomLevels {
  readonly ambient: number;
  readonly lamp: number;
  /** The alarm channel with the pulse applied. */
  readonly alarm: number;
}

interface RoomTracks {
  readonly ambient: LevelTrack;
  readonly lamp: LevelTrack;
  readonly alarm: LevelTrack;
}

/** The ramps of every room and fixture, and the levels they give at a time. */
export class LightModel {
  private readonly rooms = new Map<string, RoomTracks>();
  private readonly fixtures = new Map<string, LevelTrack>();

  constructor(
    roomIds: Iterable<string>,
    fixtureIds: Iterable<string>,
    private readonly reducedMotion: boolean,
    private readonly rampMs: number = DEFAULT_RAMP_MS,
  ) {
    const start = roomTarget('powered');
    for (const id of roomIds) {
      this.rooms.set(id, {
        ambient: new LevelTrack(start.ambient),
        lamp: new LevelTrack(start.lamp),
        alarm: new LevelTrack(start.alarm),
      });
    }
    for (const id of fixtureIds) this.fixtures.set(id, new LevelTrack(1));
  }

  /** Starts the ramps of a change. Under reduced motion every ramp has no duration. */
  apply(change: DeckChange, now: number): void {
    const ramp: Ramp = this.reducedMotion
      ? { delay: 0, duration: 0 }
      : (change.patch.ramp ?? { delay: 0, duration: this.rampMs });
    for (const [id, state] of Object.entries(change.patch.rooms ?? {})) {
      const tracks = this.rooms.get(id);
      if (tracks === undefined) continue;
      const target = roomTarget(state);
      tracks.ambient.set(target.ambient, now, ramp);
      tracks.lamp.set(target.lamp, now, ramp);
      tracks.alarm.set(target.alarm, now, ramp);
    }
    for (const [id, state] of Object.entries(change.patch.fixtures ?? {})) {
      this.fixtures.get(id)?.set(fixtureTarget(state), now, ramp);
    }
  }

  room(id: string, now: number): RoomLevels | undefined {
    const tracks = this.rooms.get(id);
    if (tracks === undefined) return undefined;
    return {
      ambient: tracks.ambient.value(now),
      lamp: tracks.lamp.value(now),
      alarm: tracks.alarm.value(now) * pulse(now, this.reducedMotion),
    };
  }

  fixture(id: string, now: number): number | undefined {
    return this.fixtures.get(id)?.value(now);
  }

  /** Whether the next frame can differ from this one: a ramp is moving, or an alarm pulses. */
  animating(now: number): boolean {
    for (const tracks of this.rooms.values()) {
      if (!tracks.ambient.settled(now) || !tracks.lamp.settled(now))
        return true;
      if (!tracks.alarm.settled(now)) return true;
      if (!this.reducedMotion && tracks.alarm.target > 0) return true;
    }
    for (const track of this.fixtures.values()) {
      if (!track.settled(now)) return true;
    }
    return false;
  }
}

/**
 * The level of one light. A light that names a fixture follows that fixture's
 * glow, and any other light follows its room's lamp channel.
 */
export function lightLevel(
  light: Pick<DeckLight, 'fixture'>,
  room: RoomLevels | undefined,
  fixture: number | undefined,
): number {
  if (light.fixture !== null && fixture !== undefined) return fixture;
  return room?.lamp ?? 0;
}

/** A `#rrggbb` string as a number. */
export function hexToInt(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** The tint of a light's art colour. A name the palette lacks takes the lamp colour. */
export function tintOf(colour: string, palette: DeckPalette): number {
  const hex = Object.hasOwn(palette, colour)
    ? palette[colour as keyof DeckPalette]
    : palette.lamp;
  return hexToInt(hex);
}

/** The size of a light's sprite in pixels of the frame: the housing's width plus the reach on each side (`REACH` times the radius). */
export function spriteSize(light: Pick<DeckLight, 'radius' | 'box'>): {
  readonly width: number;
  readonly height: number;
} {
  const [left, , right] = light.box;
  const reach = light.radius * REACH;
  return { width: right - left + 2 * reach, height: 2 * reach };
}

/** The glow of the light at `distance` from its centre as a share of its reach: 1 at the centre, 0 at the edge. */
export function falloff(distance: number): number {
  if (distance <= 0) return 1;
  if (distance >= 1) return 0;
  const inverse = 1 - distance;
  return inverse * inverse * (3 - 2 * inverse);
}

/** A square of premultiplied RGBA pixels holding the radial glow, white at the centre. */
export function radialPixels(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / centre;
      const value = Math.round(falloff(distance) * 255);
      const at = (y * size + x) * 4;
      pixels[at] = value;
      pixels[at + 1] = value;
      pixels[at + 2] = value;
      pixels[at + 3] = value;
    }
  }
  return pixels;
}
