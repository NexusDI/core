import { REQUEST, type NexusRequest } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import {
  type AtmosphereReading,
  COMPARTMENT_IDS,
  type CompartmentId,
  DOOR_IDS,
  type FtlRating,
  type ShipCommand,
  type ShipReading,
} from '@nexusdi/meridian-systems';

import type { INavCharts } from '@nexusdi/meridian-systems/charts';

import type {
  BridgeOffline,
  CommandAnswer,
  IBridgeLink,
  ITelemetryClient,
} from '../app/di/contracts';

/** The rating `POST /sections/ftl` answers for the Meridian's drive. */
export const FTL_RATING: FtlRating = {
  energy: 90_000_000_000,
  power: 900_000_000,
  pulseShare: 0.1,
  reactorLevel: 0.9,
  coolantLimit: 1_300,
};

/** Charts that hold every star and plot every course at heading 42. */
export class FixedCharts implements INavCharts {
  has() {
    return true;
  }
  plot(to: string) {
    return { to, heading: 42 };
  }
  stars() {
    return ['Kepler-442b', 'Proxima-b'];
  }
}

/** The headings of the two stars `FakeCharts` holds. */
export const FAKE_STARS = { Vega: 11, Altair: 22 } as const;

/** Charts over a two-star table in memory, with no bundled table behind them. */
export class FakeCharts implements INavCharts {
  has(to: string) {
    return Object.hasOwn(FAKE_STARS, to);
  }
  plot(to: string) {
    return {
      to,
      heading: this.has(to) ? FAKE_STARS[to as keyof typeof FAKE_STARS] : 0,
    };
  }
  stars() {
    return Object.keys(FAKE_STARS);
  }
}

/**
 * A compartment at 293 K that carries the pressure the backend reports for
 * ship air, 101.3 kPa. The moles are arbitrary round numbers, since the
 * console reads the pressure and never derives it.
 */
const air = (moles: number) => ({
  moles: { O2: moles * 0.21, N2: moles * 0.78, CO2: 2, H2O: 45, volatiles: 3 },
  temperature: 293,
  pressure: 101_300,
});

/** A bay that holds vacuum, at 293 K with no gas. */
const vacuum = {
  moles: { O2: 0, N2: 0, CO2: 0, H2O: 0, volatiles: 0 },
  temperature: 293,
  pressure: 0,
};

/** `value` under each of `ids`. */
const each = <K extends string, V>(ids: readonly K[], value: V) =>
  Object.fromEntries(ids.map((id) => [id, value])) as Record<K, V>;

/** The rooms with a heater: all but the reactor bay, the airlock and the two bays. */
const HEATED = [
  'bridge',
  'habitat',
  'chart-room',
  'computer-core',
  'quarters',
  'comms-relay',
  'capacitor-room',
  'engineering',
  'ftl-core',
  'main-drive',
] as const satisfies readonly CompartmentId[];

/** The rooms where crew breathe, each with a scrubber and an oxygen generator. */
const CREWED = [
  'bridge',
  'habitat',
  'quarters',
] as const satisfies readonly CompartmentId[];

/** The rooms with a flood charge: every room but the airlock and the two bays. */
const CHARGED = [
  'bridge',
  'habitat',
  'reactor-bay',
  'chart-room',
  'computer-core',
  'quarters',
  'comms-relay',
  'capacitor-room',
  'engineering',
  'ftl-core',
  'main-drive',
] as const satisfies readonly CompartmentId[];

/**
 * The ship reading at tick 0, as `GET /sim` answers it: the router lists no
 * load before tick 1, and the ship holds no FTL record before the drive
 * loads.
 */
export const shipAtStart: ShipReading = {
  tick: 0,
  time: 0,
  compartments: {
    bridge: air(2500),
    habitat: air(5000),
    'reactor-bay': air(3300),
    airlock: air(500),
    'chart-room': air(1000),
    'computer-core': air(830),
    quarters: air(2000),
    'comms-relay': air(670),
    'shuttle-bay': vacuum,
    'drone-bay': vacuum,
    'capacitor-room': air(1500),
    engineering: air(3740),
    'ftl-core': air(2080),
    'main-drive': air(1660),
  },
  comms: { status: 'standby', sent: null, messages: [] },
  coolant: { temperature: 500 },
  drive: { thrust: 0, massFlow: 0, acceleration: 0, velocity: 0, distance: 0 },
  helm: { attitude: 0, rate: 0, torque: 0 },
  lifeSupport: { heaters: each(HEATED, 0) },
  power: { output: 0, loads: [], shed: [] },
  reactor: { level: 0, thermal: 0, electric: 0, tripped: false },
  safety: {
    fires: each(COMPARTMENT_IDS, 0),
    flooded: each(CHARGED, 0),
    alarms: [],
  },
  weapons: { status: 'idle', charge: 0, shots: 0, hits: 0, lastShot: null },
  setpoints: {
    comms: { hail: false },
    drive: { throttle: 0 },
    helm: { heading: 0 },
    lifeSupport: {
      online: false,
      heaters: each(HEATED, { on: true, target: 293 }),
      scrubbers: each(CREWED, true),
      oxygen: each(CREWED, true),
      vents: { airlock: false },
      pumps: { airlock: 'off' },
    },
    reactor: { throttle: 0 },
    safety: {
      doors: each(DOOR_IDS, false),
      floods: each(CHARGED, false),
      drills: each(CHARGED, false),
      acknowledge: false,
    },
    shields: { raised: false },
    weapons: { armed: false, range: null },
  },
};

/**
 * The six loads at 0 W, in the order the router serves them, as an idle
 * ship lists them from tick 1 on.
 */
export const idleLoads: ShipReading['power']['loads'] = [
  { id: 'life-support', priority: 1, demand: 0, allocated: 0 },
  { id: 'shields', priority: 2, demand: 0, allocated: 0 },
  { id: 'comms', priority: 3, demand: 0, allocated: 0 },
  { id: 'thrusters', priority: 4, demand: 0, allocated: 0 },
  { id: 'main-drive', priority: 5, demand: 0, allocated: 0 },
  { id: 'railgun', priority: 6, demand: 0, allocated: 0 },
];

/**
 * Seed 7's analyzer readings at tick 0, as `GET /compartments/:id/atmosphere`
 * answers them: the true air plus each analyzer's noise, rounded to 0.01 K
 * and 1 Pa.
 */
export const airAtStart: Readonly<
  Record<CompartmentId, AtmosphereReading<CompartmentId>>
> = {
  bridge: {
    compartment: 'bridge',
    tick: 0,
    temperature: 292.98,
    pressure: 101_290,
    partial: { O2: 21_274, N2: 79_010, CO2: 37, H2O: 916, volatiles: 65 },
  },
  habitat: {
    compartment: 'habitat',
    tick: 0,
    temperature: 293.04,
    pressure: 101_286,
    partial: { O2: 21_272, N2: 79_014, CO2: 44, H2O: 912, volatiles: 62 },
  },
  'reactor-bay': {
    compartment: 'reactor-bay',
    tick: 0,
    temperature: 293.02,
    pressure: 101_301,
    partial: { O2: 21_271, N2: 79_010, CO2: 44, H2O: 909, volatiles: 61 },
  },
  airlock: {
    compartment: 'airlock',
    tick: 0,
    temperature: 293.02,
    pressure: 101_310,
    partial: { O2: 21_277, N2: 79_011, CO2: 37, H2O: 913, volatiles: 58 },
  },
  'chart-room': {
    compartment: 'chart-room',
    tick: 0,
    temperature: 292.96,
    pressure: 101_301,
    partial: { O2: 21_269, N2: 79_010, CO2: 39, H2O: 917, volatiles: 57 },
  },
  'computer-core': {
    compartment: 'computer-core',
    tick: 0,
    temperature: 292.98,
    pressure: 101_317,
    partial: { O2: 21_274, N2: 79_018, CO2: 37, H2O: 910, volatiles: 60 },
  },
  quarters: {
    compartment: 'quarters',
    tick: 0,
    temperature: 293.03,
    pressure: 101_308,
    partial: { O2: 21_276, N2: 79_015, CO2: 43, H2O: 913, volatiles: 61 },
  },
  'comms-relay': {
    compartment: 'comms-relay',
    tick: 0,
    temperature: 292.97,
    pressure: 101_299,
    partial: { O2: 21_277, N2: 79_011, CO2: 41, H2O: 908, volatiles: 59 },
  },
  'shuttle-bay': {
    compartment: 'shuttle-bay',
    tick: 0,
    temperature: 293,
    pressure: 0,
    partial: { O2: 0, N2: 0, CO2: 0, H2O: 0, volatiles: 0 },
  },
  'drone-bay': {
    compartment: 'drone-bay',
    tick: 0,
    temperature: 293.03,
    pressure: 20,
    partial: { O2: 0, N2: 0, CO2: 0, H2O: 0, volatiles: 4 },
  },
  'capacitor-room': {
    compartment: 'capacitor-room',
    tick: 0,
    temperature: 293.01,
    pressure: 101_300,
    partial: { O2: 21_278, N2: 79_013, CO2: 44, H2O: 909, volatiles: 59 },
  },
  engineering: {
    compartment: 'engineering',
    tick: 0,
    temperature: 293,
    pressure: 101_286,
    partial: { O2: 21_269, N2: 79_014, CO2: 45, H2O: 910, volatiles: 64 },
  },
  'ftl-core': {
    compartment: 'ftl-core',
    tick: 0,
    temperature: 293.02,
    pressure: 101_303,
    partial: { O2: 21_269, N2: 79_016, CO2: 43, H2O: 913, volatiles: 58 },
  },
  'main-drive': {
    compartment: 'main-drive',
    tick: 0,
    temperature: 292.96,
    pressure: 101_290,
    partial: { O2: 21_275, N2: 79_009, CO2: 42, H2O: 915, volatiles: 65 },
  },
};

/** One server-sent event as the bridge's `GET /telemetry` frames it. */
const snapshotEvent = (ship: ShipReading) =>
  new TextEncoder().encode(
    `event: snapshot\ndata: ${JSON.stringify(ship)}\n\n`,
  );

/**
 * The double of BRIDGE_LINK: it answers the way bridge-api's
 * `GET /course/:to` does, from the scope's mission, and `POST /commands`
 * the way the seeded ship does at tick 0, with no server. Its ship sits at
 * tick 0, its analyzers read seed 7's air at tick 0, its telemetry sends
 * that one frame and ends, and it has no graph.
 * Route tests override BRIDGE_LINK with `fakeBridgeLink`, a scoped binding
 * of this class, or with a subclass that changes one answer.
 */
export class FakeBridgeLink implements IBridgeLink {
  static deps = [REQUEST] as const;
  constructor(private readonly request: NexusRequest) {}
  async course(to: string) {
    return {
      course: { to, heading: 42 },
      entries: [`${this.request.mission.id}: plotting ${to}`],
    };
  }
  async snapshot() {
    return shipAtStart;
  }
  /** Rejects a compartment the deck lacks, as the link does on the 404. */
  async atmosphere(compartment: string) {
    if (!Object.hasOwn(airAtStart, compartment)) {
      throw new Error(
        `bridge-api answered 404 for /compartments/${compartment}/atmosphere`,
      );
    }
    return airAtStart[compartment as CompartmentId];
  }
  async telemetry() {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(snapshotEvent(shipAtStart));
        controller.close();
      },
    });
  }
  async graph(): Promise<NexusGraph | null> {
    return null;
  }
  /** The idle reactor: it powers no shields, and it queues any other command for tick 1. */
  async command(cmd: ShipCommand): Promise<CommandAnswer> {
    if (cmd.raised !== true) return { accepted: true, tick: 1 };
    return {
      accepted: false,
      status: 409,
      code: 'MERIDIAN_POWER_BUDGET',
      message:
        'The shields load needs 200 MW, and the router has 0 MW free beside the loads above it.',
      fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
    };
  }
  /** Loads a drive with the Meridian's spool rating. */
  async loadFtl(): Promise<FtlRating | BridgeOffline> {
    return FTL_RATING;
  }
}

/** A link whose snapshot call fails, as when bridge-api answers 503. */
export class FailingSnapshotLink extends FakeBridgeLink {
  override async snapshot(): Promise<ShipReading> {
    throw new Error('bridge-api answered 503 for /sim');
  }
}

/** A link double class whose snapshot always answers `ship`. */
export const linkAt = (ship: ShipReading): typeof FakeBridgeLink =>
  class FixedSnapshotLink extends FakeBridgeLink {
    override async snapshot() {
      return ship;
    }
  };

/** The override of BRIDGE_LINK the route tests use. */
export const fakeBridgeLink = {
  useClass: FakeBridgeLink,
  lifetime: 'scoped',
} as const;

/**
 * A TELEMETRY_CLIENT that a test drives: `push` sends a ship reading to every
 * subscriber, and `drop` takes the stream offline.
 */
export class FakeTelemetry implements ITelemetryClient {
  #subscribers = new Set<{
    next: (ship: ShipReading) => void;
    offline: (reason: string) => void;
  }>();
  subscribe(
    next: (ship: ShipReading) => void,
    offline: (reason: string) => void,
  ) {
    const subscriber = { next, offline };
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }
  /** Sends `ship` as the next frame. */
  push(ship: ShipReading) {
    for (const subscriber of [...this.#subscribers]) subscriber.next(ship);
  }
  /** Ends the stream with `reason`. */
  drop(reason = 'telemetry lost') {
    const lost = [...this.#subscribers];
    this.#subscribers.clear();
    for (const subscriber of lost) subscriber.offline(reason);
  }
}
