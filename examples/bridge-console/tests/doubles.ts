import { REQUEST, type NexusRequest } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import type { ShipSnapshot } from '@nexusdi/meridian-systems';

import type { IBridgeLink } from '../app/bridge/bridge-link';

/** The moles of ship air at 101.3 kPa and 293 K in `volume` cubic metres. */
function air(volume: number) {
  const total = (101_300 * volume) / (8.314 * 293);
  return {
    moles: {
      O2: total * 0.21,
      N2: total * 0.78,
      CO2: total * 0.0004,
      H2O: total * 0.009,
      volatiles: total * 0.0006,
    },
    temperature: 293,
  };
}

/** The ship at tick 0, with each compartment's volume from the deck plan. */
export const shipAtStart: ShipSnapshot = {
  tick: 0,
  time: 0,
  compartments: {
    bridge: air(60),
    habitat: air(120),
    'reactor-bay': air(80),
    airlock: air(12),
  },
};

/** One server-sent event as the bridge's `GET /telemetry` frames it. */
const snapshotEvent = (ship: ShipSnapshot) =>
  new TextEncoder().encode(
    `event: snapshot\ndata: ${JSON.stringify(ship)}\n\n`,
  );

/**
 * The double of BRIDGE_LINK: it answers the way bridge-api's
 * `GET /course/:to` does, from the scope's mission, with no server. Its
 * ship sits at tick 0, its telemetry sends that one frame and ends, and it
 * has no graph. Route tests override BRIDGE_LINK with `fakeBridgeLink`, a
 * scoped binding of this class, or with a subclass that changes one answer.
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
}

/** The override of BRIDGE_LINK the route tests use. */
export const fakeBridgeLink = {
  useClass: FakeBridgeLink,
  lifetime: 'scoped',
} as const;
