import { Nexus } from '@nexusdi/core';
import { expect } from 'vitest';

import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  type ITickLoop,
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';
import { shipRoot } from '../test/ship-root';

/** What a golden script drives, and the `capture` that puts a reading into the golden. */
export interface GoldenShip {
  readonly nexus: Nexus;
  readonly desk: ICommandDesk;
  readonly loop: ITickLoop;
  /** Rounds `ship` into the golden and returns the rounded copy. */
  capture(ship: ShipSnapshot): ShipSnapshot;
}

/** How a golden's ship is built: the relay it links to, and the options of `Nexus.create`. */
export interface GoldenBuild {
  readonly relayUrl?: string;
  readonly create?: Parameters<typeof Nexus.create>[1];
}

/** The idle ship's golden script: the start, tick 1 and tick 600. */
export function idleScript({ nexus, loop, capture }: GoldenShip): void {
  capture(nexus.get(SHIP_STATE).snapshot());
  capture(loop.advance(1));
  capture(loop.advance(599));
}

/**
 * The bytes of the golden `script` records: the captured readings as JSON
 * with two-space indents and a closing newline.
 */
export async function goldenText(
  script: (ship: GoldenShip) => void | Promise<void>,
  { relayUrl, create }: GoldenBuild = {},
): Promise<string> {
  await using nexus = await Nexus.create(shipRoot({ relayUrl }), create);
  const record: ShipSnapshot[] = [];
  await script({
    nexus,
    desk: nexus.get(COMMAND_DESK),
    loop: nexus.get(TICK_LOOP),
    capture(ship) {
      const rounded = roundSnapshot(ship);
      record.push(rounded);
      return rounded;
    },
  });
  return JSON.stringify(record, null, 2) + '\n';
}

/**
 * Runs `script` on a seed 7 ship and compares what it captures with
 * `golden/<name>.seed-7.json`, which `vitest -u` rewrites.
 */
export async function recordGolden(
  name: string,
  script: (ship: GoldenShip) => void | Promise<void>,
  build?: GoldenBuild,
): Promise<void> {
  await expect(await goldenText(script, build)).toMatchFileSnapshot(
    `golden/${name}.seed-7.json`,
  );
}
