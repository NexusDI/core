import { expect, it } from 'vitest';

import type { ShipCommand } from '../src/simulation/commands';
import { INTERLOCK_PLUGINS } from '../test/support';

import { recordGolden } from './golden';

const pump = (mode: string): ShipCommand => ({
  system: 'life-support',
  action: 'pump',
  compartment: 'airlock',
  mode,
});
const vent = (open: boolean): ShipCommand => ({
  system: 'life-support',
  action: 'vent',
  compartment: 'airlock',
  open,
});
const door = (action: 'open' | 'close', id: string): ShipCommand => ({
  system: 'safety',
  action,
  door: id,
});

/**
 * The drill's accepted commands, by the tick they are submitted on. The
 * refused opens queue nothing, so the table leaves them to
 * `test/airlock.test.ts`, and any command here the interlock refused would
 * throw and fail the case.
 */
const steps: readonly { at: number; commands: readonly ShipCommand[] }[] = [
  {
    at: 0,
    commands: [
      { system: 'engineering', action: 'throttle', level: 0.01 },
      { system: 'life-support', action: 'online' },
      pump('evacuate'),
    ],
  },
  { at: 288, commands: [pump('off'), vent(true)] },
  { at: 317, commands: [door('open', 'airlock-outer')] },
  {
    at: 337,
    commands: [door('close', 'airlock-outer'), vent(false), pump('fill')],
  },
  { at: 446, commands: [pump('off'), door('open', 'habitat-airlock')] },
];

/** The last tick the golden pins, 20 ticks after the command that opens the inner door. */
const end = 466;

it('pins the airlock drill under the interlock, seed 7, to the golden', () =>
  recordGolden(
    'airlock',
    ({ desk, loop, capture }) => {
      // The golden pins the ship at each step after tick 0, read before that
      // step's commands, and at the end.
      const ticks: number[] = [];
      let tick = 0;
      for (const { at, commands } of steps) {
        if (at > tick) ticks.push(capture(loop.advance(at - tick)).tick);
        tick = at;
        for (const command of commands) desk.submit(command);
      }
      ticks.push(capture(loop.advance(end - tick)).tick);
      expect(ticks).toEqual([288, 317, 337, 446, 466]);
    },
    { create: { plugins: INTERLOCK_PLUGINS } },
  ));
