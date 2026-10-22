import { Nexus } from '@nexusdi/core';
import { interceptors } from '@nexusdi/interceptors';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK, type ShipCommand } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';
import { BLAST_DOORS } from '../src/systems/safety/contracts';
import { PressureInterlock } from '../src/systems/safety/pressure-interlock';

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

it('pins the airlock drill under the interlock, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(
    meridianSystems({ seed: 7, dt: 0.5 }),
    {
      plugins: [
        interceptors({
          register: [PressureInterlock],
          bindings: [
            { token: BLAST_DOORS, methods: { open: [PressureInterlock] } },
          ],
        }),
      ],
    },
  );
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);

  // The golden pins the ship at each step after tick 0, read before that
  // step's commands, and at the end.
  const record = [];
  let tick = 0;
  for (const { at, commands } of steps) {
    if (at > tick) record.push(roundSnapshot(loop.advance(at - tick)));
    tick = at;
    for (const command of commands) desk.submit(command);
  }
  record.push(roundSnapshot(loop.advance(end - tick)));
  expect(record.map((ship) => ship.tick)).toEqual([288, 317, 337, 446, 466]);

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/airlock.seed-7.json',
  );
});
