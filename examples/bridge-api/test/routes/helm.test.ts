import { Nexus } from '@nexusdi/core';
import { SHIP_STATE, type ShipReading } from '@nexusdi/meridian-systems';
import { describe, expect } from 'vitest';

import { AUDIT_LOG } from '../../src/ship/contracts';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { test } from '../fixtures';
import { calls, json } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the helm commands on %s', (framework) => {
  const call = calls[framework];
  const throttle = json({
    system: 'engineering',
    action: 'throttle',
    level: 0.6,
  });
  const course = json({
    system: 'helm',
    action: 'course',
    to: 'Kepler-442b',
  });
  const burn = json({ system: 'helm', action: 'burn', level: 1 });
  const advance = (ship: Nexus, ticks: number) =>
    call(ship, 'POST', '/sim/advance', json({ ticks }));
  const reading = async (ship: Nexus) =>
    (await call(ship, 'GET', '/sim')).body as ShipReading;
  const helmUsage =
    'It takes course with a charted star to steer for and burn with a level from 0 to 1.';
  const refusals = [
    {
      sent: { system: 'helm', action: 'burn', level: 1.5 },
      message: `helm burn cannot use the level argument. ${helmUsage}`,
      fix: 'send the arguments in the ranges above.',
    },
    {
      sent: { system: 'helm', action: 'course' },
      message: `helm course needs the to argument. ${helmUsage}`,
      fix: 'send the arguments in the ranges above.',
    },
    {
      sent: { system: 'helm', action: 'flip' },
      message: `helm has no action 'flip'. ${helmUsage}`,
      fix: 'send one of the actions above with its arguments.',
    },
  ];

  test('a course and a burn on the linked ship shed both loads at tick 1 and turn the ship at tick 2', async ({
    nexus,
  }) => {
    for (const command of [throttle, course, burn]) {
      expect(await call(nexus, 'POST', '/commands', command)).toEqual({
        status: 202,
        body: { tick: 1 },
      });
    }
    expect(nexus.get(AUDIT_LOG).calls).toEqual([
      'has Kepler-442b',
      'plot Kepler-442b',
    ]);

    await advance(nexus, 1);
    const shed = await reading(nexus);
    expect(shed.setpoints.helm).toEqual({ heading: 0.73303829 });
    expect(shed.setpoints.drive).toEqual({ throttle: 1 });
    expect(shed.helm).toEqual({ attitude: 0, rate: 0, torque: 0 });
    expect(shed.power.loads).toContainEqual({
      id: 'thrusters',
      priority: 4,
      demand: 20_000_000,
      allocated: 0,
    });
    expect(shed.power.loads).toContainEqual({
      id: 'main-drive',
      priority: 5,
      demand: 600_000_000,
      allocated: 0,
    });
    expect(shed.power.shed).toEqual(['thrusters', 'main-drive']);
    expect(shed.safety.alarms).toEqual([
      { code: 'LOAD_SHED', subject: 'thrusters' },
      { code: 'LOAD_SHED', subject: 'main-drive' },
    ]);

    await advance(nexus, 1);
    const turning = await reading(nexus);
    expect(turning.helm).toEqual({
      attitude: 0.00037878788,
      rate: 0.00075757576,
      torque: 5_000_000,
    });
    expect(turning.power.loads).toContainEqual({
      id: 'thrusters',
      priority: 4,
      demand: 20_000_000,
      allocated: 20_000_000,
    });
    expect(turning.power.shed).toEqual(['main-drive']);
    expect(turning.safety.alarms).toEqual([
      { code: 'LOAD_SHED', subject: 'main-drive' },
    ]);
    expect(
      nexus
        .get(AUDIT_LOG)
        .calls.filter(
          (entry) => entry.startsWith('has ') || entry.startsWith('plot '),
        ),
    ).toEqual(['has Kepler-442b', 'plot Kepler-442b']);
    expect(await call(nexus, 'GET', '/commands')).toEqual({
      status: 200,
      body: [
        {
          tick: 1,
          change: {
            reactor: { throttle: 0.6 },
            helm: { heading: (42 * Math.PI) / 180 },
            drive: { throttle: 1 },
          },
        },
      ],
    });
  });

  test('a course to TRAPPIST-1e on the offline ship steers the bundled heading, and the audit records the chart reads', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    expect(
      await call(
        ship,
        'POST',
        '/commands',
        json({ system: 'helm', action: 'course', to: 'TRAPPIST-1e' }),
      ),
    ).toEqual({ status: 202, body: { tick: 1 } });
    expect(ship.get(AUDIT_LOG).calls).toEqual([
      'has TRAPPIST-1e',
      'plot TRAPPIST-1e',
    ]);
    await advance(ship, 1);
    expect((await reading(ship)).setpoints.helm.heading).toBe(-2.7401669);
  });

  const refused = async (ship: Nexus) => {
    for (const { sent, message, fix } of refusals) {
      expect(await call(ship, 'POST', '/commands', json(sent))).toEqual({
        status: 400,
        body: { code: 'MERIDIAN_BAD_COMMAND', message, fix },
      });
    }
    expect(ship.get(SHIP_STATE).log()).toEqual([]);
  };

  test('POST /commands answers 400 for a bad helm command on the linked ship', async ({
    nexus,
  }) => {
    await refused(nexus);
  });

  test('POST /commands answers 400 for a bad helm command on the offline ship', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    await refused(ship);
  });

  test.each(['Vega', 'constructor', '__proto__'])(
    'POST /commands answers 400 for a course to %s on the offline ship, which the charts do not hold',
    async (to) => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      expect(
        await call(
          ship,
          'POST',
          '/commands',
          json({ system: 'helm', action: 'course', to }),
        ),
      ).toEqual({
        status: 400,
        body: {
          code: 'MERIDIAN_BAD_COMMAND',
          message: `helm course cannot use the to argument. ${helmUsage}`,
          fix: 'send the arguments in the ranges above.',
        },
      });
      await advance(ship, 1);
      const after = await reading(ship);
      expect(after.setpoints.helm).toEqual({ heading: 0 });
      expect(
        after.safety.alarms.filter((alarm) => alarm.code === 'LOAD_SHED'),
      ).toEqual([]);
    },
  );
});
