import { all, lazy, provide } from '@nexusdi/core';

import { SHIP_STATE } from '../src/simulation/contracts';
import { Simulation } from '../src/simulation/simulation.module';
import {
  POWER_CONSUMERS,
  POWER_ROUTER,
} from '../src/systems/engineering/contracts';
import { FusionReactor } from '../src/systems/engineering/fusion-reactor';
import { PlasmaRouter } from '../src/systems/engineering/plasma-router';
import { ATMOSPHERE_SENSOR } from '../src/systems/life-support/contracts';
import type { IAlarmBoard } from '../src/systems/safety/contracts';

/**
 * Wiring the compiler refuses. Each case sits under `@ts-expect-error`, so
 * `typecheck` fails on an unused directive the day a wrong wiring compiles.
 * Nothing here runs: vitest does not collect `*.test-d.ts`.
 */

export const outOfOrderDeps = [
  // @ts-expect-error deps list the thunk first, the constructor takes the state first
  provide(POWER_ROUTER, {
    useClass: PlasmaRouter,
    deps: [lazy(all(POWER_CONSUMERS)), SHIP_STATE],
  }),
];

export const sensorBoundToReactor = [
  // @ts-expect-error FusionReactor is not an IAtmosphereSensor
  provide(ATMOSPHERE_SENSOR, { useClass: FusionReactor }),
];

export const stringSeed = [
  // @ts-expect-error seed is a number
  Simulation.forRoot({ seed: '7', dt: 0.5 }),
];

/** The narrow board lists alarms and has no way to acknowledge them. */
export const boardCannotAcknowledge = (board: IAlarmBoard) =>
  // @ts-expect-error IAlarmBoard has active() alone
  board.acknowledge();
