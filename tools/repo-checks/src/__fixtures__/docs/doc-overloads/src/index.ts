/** A beacon a relay can ping. */
export class Beacon {
  constructor(readonly name: string) {}
}

/** Pings one beacon by name. */
export function ping(name: string): string;
/** Pings every beacon given. */
export function ping(beacons: readonly Beacon[]): string[];
export function ping(target: string | readonly Beacon[]): string | string[] {
  return typeof target === 'string'
    ? target
    : target.map((beacon) => beacon.name);
}

/** Has one signature, so G10 covers it alone. */
export function hail(name: string): string {
  return name;
}

/** Relays a message. */
export class Relay {
  /** Sends to one station. */
  send(to: string): number;
  /** Sends to every station given. */
  send(to: readonly string[]): number;
  send(to: string | readonly string[]): number {
    return typeof to === 'string' ? 1 : to.length;
  }
}

/** A radio a relay hands out. */
export interface Station {
  /** Tunes to a channel by number. */
  tune(channel: number): string;
  /** Tunes to a channel by name. */
  tune(channel: string): string;
}

/** The relay's station. */
export function station(): Station {
  return { tune: (channel: number | string) => String(channel) };
}
