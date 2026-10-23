import { REQUEST, type NexusRequest } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import type {
  AtmosphereReading,
  CompartmentId,
  ShipCommand,
  ShipReading,
} from '@nexusdi/meridian-systems';

import type { CommandAnswer, IBridgeLink } from '../app/bridge/bridge-link';

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

/** The ship reading at tick 0, as `GET /sim` answers it. */
export const shipAtStart: ShipReading = {
  tick: 0,
  time: 0,
  compartments: {
    bridge: air(2500),
    habitat: air(5000),
    'reactor-bay': air(3300),
    airlock: air(500),
  },
  reactor: { level: 0, thermal: 0, electric: 0, tripped: false },
  coolant: { temperature: 500 },
  power: {
    output: 0,
    loads: [
      { id: 'life-support', priority: 1, demand: 0, allocated: 0 },
      { id: 'shields', priority: 2, demand: 0, allocated: 0 },
      { id: 'comms', priority: 3, demand: 0, allocated: 0 },
      { id: 'thrusters', priority: 4, demand: 0, allocated: 0 },
      { id: 'main-drive', priority: 5, demand: 0, allocated: 0 },
    ],
    shed: [],
  },
  lifeSupport: { heaters: { bridge: 0, habitat: 0 } },
  comms: { status: 'standby', sent: null, messages: [] },
  drive: { thrust: 0, massFlow: 0, acceleration: 0, velocity: 0, distance: 0 },
  helm: { attitude: 0, rate: 0, torque: 0 },
  ftl: { status: 'offline', charge: 0, sector: 'Sol', jumped: null },
  safety: {
    fires: { bridge: 0, habitat: 0, 'reactor-bay': 0, airlock: 0 },
    flooded: { bridge: 0, habitat: 0, 'reactor-bay': 0 },
    alarms: [],
  },
  setpoints: {
    reactor: { throttle: 0 },
    shields: { raised: false },
    lifeSupport: {
      online: false,
      heaters: {
        bridge: { on: true, target: 293 },
        habitat: { on: true, target: 293 },
      },
      scrubbers: { bridge: true, habitat: true },
      oxygen: { bridge: true, habitat: true },
      vents: { airlock: false },
      pumps: { airlock: 'off' },
    },
    comms: { hail: false },
    drive: { throttle: 0 },
    helm: { heading: 0 },
    ftl: { armed: false, jump: null },
    safety: {
      doors: {
        'bridge-habitat': false,
        'habitat-reactor-bay': false,
        'habitat-airlock': false,
        'airlock-outer': false,
      },
      floods: { bridge: false, habitat: false, 'reactor-bay': false },
      drills: { bridge: false, habitat: false, 'reactor-bay': false },
    },
  },
};

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
}

/** The override of BRIDGE_LINK the route tests use. */
export const fakeBridgeLink = {
  useClass: FakeBridgeLink,
  lifetime: 'scoped',
} as const;
