import { ATMOSPHERE_PROBE, COMPARTMENT_IDS } from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, test } from 'vitest';

import { SIM_DRIVER } from '../../src/ship/contracts';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { FailingProbe } from '../doubles';
import { calls, json } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the alarm board on %s', (framework) => {
  const call = calls[framework];
  const ship = () =>
    createTestingContainer(OfflineMeridian)
      .override(ATMOSPHERE_PROBE, { useClass: FailingProbe })
      .create({ plugins: bridgePlugins() });

  test('GET /alarms answers an empty list at tick 0', async () => {
    await using quiet = await createTestingContainer(OfflineMeridian).create({
      plugins: bridgePlugins(),
    });
    expect(await call(quiet, 'GET', '/alarms')).toEqual({
      status: 200,
      body: { alarms: [] },
    });
  });

  test('GET /alarms lists the active alarms with their mark, in board order', async () => {
    await using faulty = await ship();
    faulty.get(SIM_DRIVER).advance(10);
    expect(await call(faulty, 'GET', '/alarms')).toEqual({
      status: 200,
      body: {
        alarms: COMPARTMENT_IDS.map((subject) => ({
          code: 'SENSOR_FAULT',
          subject,
          acknowledged: false,
        })),
      },
    });
  });

  test('POST /commands acknowledge answers 202 with the tick of the next frame, and the next list shows the mark', async () => {
    await using faulty = await ship();
    faulty.get(SIM_DRIVER).advance(10);
    expect(
      await call(
        faulty,
        'POST',
        '/commands',
        json({ system: 'safety', action: 'acknowledge' }),
      ),
    ).toMatchObject({ status: 202, body: { tick: 11 } });
    faulty.get(SIM_DRIVER).advance(10);
    const { body } = await call(faulty, 'GET', '/alarms');
    const { alarms } = body as { alarms: { acknowledged: boolean }[] };
    expect(alarms).toHaveLength(COMPARTMENT_IDS.length);
    expect(alarms.every((alarm) => alarm.acknowledged)).toBe(true);
  });

  test('POST /alarms is not a route', async () => {
    await using quiet = await createTestingContainer(OfflineMeridian).create({
      plugins: bridgePlugins(),
    });
    expect((await call(quiet, 'POST', '/alarms', json({}))).status).toBe(404);
  });
});
