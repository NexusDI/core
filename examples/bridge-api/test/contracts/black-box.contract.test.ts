import { defineModule, Nexus, provide } from '@nexusdi/core';
import {
  FTL_DRIVE,
  SHIP_SYSTEMS,
  type IShipSystem,
  type Phase,
} from '@nexusdi/meridian-systems';
import { expect, it } from 'vitest';

import {
  blackBox,
  phaseCheck,
  systemPhaseText,
} from '../../src/ship/black-box.plugin';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { calls } from '../route-helpers';
import {
  expectFixLine,
  findCode,
} from '@nexusdi/meridian-systems/test/fix-line';

it('the black box keeps one construct event for the FTL drive after the section loads, and the ship systems stamped with their phases', async () => {
  const box = blackBox();
  await using ship = await Nexus.create(OfflineMeridian, {
    plugins: [...bridgePlugins(), box.plugin],
  });
  expect((await calls.hono(ship, 'POST', '/sections/ftl')).status).toBe(200);
  expect(ship.get(FTL_DRIVE)).toBeDefined();
  const built = box
    .trace()
    .filter(
      (event) => event.type === 'construct' && event.token === 'FtlDrive',
    );
  expect(built).toHaveLength(1);
  const stamped = box.stamps().map(({ system }) => system);
  expect(stamped).toContain('Engineering');
  expect(stamped).not.toContain('FtlDrive');
});

it('MERIDIAN_SYSTEM_PHASE names a ship system class without a phase, with its fix line', async () => {
  class Phaseless implements IShipSystem {
    readonly name = 'phaseless';
    readonly phase: Phase = 1;
    step: IShipSystem['step'] = (ship) => ship;
  }
  const error = await Nexus.create(
    defineModule({
      name: 'Probe',
      providers: [provide(SHIP_SYSTEMS, { useClass: Phaseless })],
      exports: [SHIP_SYSTEMS],
    }),
    { plugins: [phaseCheck] },
  ).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  const refusal = findCode(error, 'MERIDIAN_SYSTEM_PHASE');
  expect(refusal.system).toBe('Phaseless');
  expect(expectFixLine(refusal, systemPhaseText)).toContain(
    'static readonly phase',
  );
});
