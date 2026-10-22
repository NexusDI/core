import { REQUEST, type NexusRequest } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import type { ShipCommand, ShipReading } from '@nexusdi/meridian-systems';

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
  power: { output: 0, loads: [], shed: [] },
  setpoints: { reactor: { throttle: 0 }, shields: { raised: false } },
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
 * tick 0, its telemetry sends that one frame and ends, and it has no graph.
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
