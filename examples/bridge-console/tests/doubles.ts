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
  /**
   * The idle reactor, with engineering's checks: a throttle level from 0 to
   * 1 queues for tick 1, a shields lower queues, a shields raise finds no
   * power, and any other command is refused as meridian-systems words it.
   */
  async command(cmd: ShipCommand): Promise<CommandAnswer> {
    const { action, level, raised } = cmd;
    if (
      action === 'throttle' &&
      typeof level === 'number' &&
      level >= 0 &&
      level <= 1
    )
      return { accepted: true, tick: 1 };
    if (action === 'shields' && raised === false)
      return { accepted: true, tick: 1 };
    if (action === 'shields' && raised === true)
      return {
        accepted: false,
        status: 409,
        code: 'MERIDIAN_POWER_BUDGET',
        message:
          'The shields load needs 200 MW, and the router has 0 MW free beside the loads above it.',
        fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      };
    return action === 'throttle' || action === 'shields'
      ? badCommand(
          `engineering ${action} got an argument it cannot use. It takes ${TAKES}.`,
          'send the arguments in the ranges above.',
        )
      : badCommand(
          `engineering has no action '${action}'. It takes ${TAKES}.`,
          'send one of the actions above with its arguments.',
        );
  }
}

/** What engineering's refusals say it takes, as meridian-systems words it. */
const TAKES =
  'throttle with a level from 0 to 1 and shields with raised true or false';

/** A 400 refusal of a ship command, as bridge-api answers one. */
const badCommand = (message: string, fix: string): CommandAnswer => ({
  accepted: false,
  status: 400,
  code: 'MERIDIAN_BAD_COMMAND',
  message,
  fix,
});

/** The override of BRIDGE_LINK the route tests use. */
export const fakeBridgeLink = {
  useClass: FakeBridgeLink,
  lifetime: 'scoped',
} as const;
