import { Nexus } from '@nexusdi/core';
import { SHIP_STATE, type ShipReading } from '@nexusdi/meridian-systems';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  vi,
} from 'vitest';

import {
  DEFAULT_RELAY_URL,
  OfflineMeridian,
} from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { test } from '../fixtures';
import { calls, json } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the comms commands on %s', (framework) => {
  const call = calls[framework];
  // Express answers over a real socket, so the spy lets every fetch through
  // and the case counts the ones to the relay.
  let fetches: MockInstance<typeof fetch>;
  beforeEach(() => {
    fetches = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetches.mockRestore();
  });
  const throttle = json({
    system: 'engineering',
    action: 'throttle',
    level: 0.01,
  });
  const hail = json({ system: 'comms', action: 'hail' });
  const advance = (ship: Nexus, ticks: number) =>
    call(ship, 'POST', '/sim/advance', json({ ticks }));
  const reading = async (ship: Nexus) =>
    (await call(ship, 'GET', '/sim')).body as ShipReading;
  const refusal = {
    status: 400,
    body: {
      code: 'MERIDIAN_BAD_COMMAND',
      message: "comms has no action 'send'. It takes hail with no arguments.",
      fix: 'send one of the actions above with its arguments.',
    },
  };

  test('a hail on the linked ship goes out at tick 1 and gets its reply at tick 5', async ({
    nexus,
  }) => {
    expect(await call(nexus, 'POST', '/commands', throttle)).toEqual({
      status: 202,
      body: { tick: 1 },
    });
    expect(await call(nexus, 'POST', '/commands', hail)).toEqual({
      status: 202,
      body: { tick: 1 },
    });

    await advance(nexus, 1);
    const sent = await reading(nexus);
    expect(sent.comms).toEqual({
      status: 'awaiting reply',
      sent: 1,
      messages: [],
    });
    expect(sent.setpoints.comms).toEqual({ hail: false });
    expect(sent.power.loads).toContainEqual({
      id: 'comms',
      priority: 3,
      demand: 5_000_000,
      allocated: 5_000_000,
    });

    await advance(nexus, 4);
    const replied = await reading(nexus);
    expect(replied.comms).toEqual({
      status: 'standby',
      sent: 1,
      messages: [
        { tick: 5, from: 'fleet traffic control', text: 'sector clear' },
      ],
    });
    expect(replied.safety.alarms).toEqual([]);
    expect(
      fetches.mock.calls.filter(([url]) =>
        String(url).startsWith(DEFAULT_RELAY_URL),
      ),
    ).toEqual([]);
    expect(await call(nexus, 'GET', '/commands')).toEqual({
      status: 200,
      body: [
        {
          tick: 1,
          change: { reactor: { throttle: 0.01 }, comms: { hail: true } },
        },
      ],
    });
  });

  test('a hail on the offline ship reports no subspace link and stays queued', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    const hailed = await call(ship, 'POST', '/commands', hail);
    expect(hailed).toEqual({
      status: 202,
      body: {
        tick: 1,
        notice: {
          code: 'MERIDIAN_NO_SUBSPACE_LINK',
          message:
            'The ship binds no SUBSPACE_LINK, so the hail waits under "no subspace link".',
          fix: expect.stringContaining('RELAY_URL'),
        },
      },
    });
    expect(JSON.stringify(hailed.body)).toContain('dev-relay');
    await advance(ship, 20);
    const offline = await reading(ship);
    expect(offline.comms.status).toBe('no subspace link');
    expect(offline.setpoints.comms.hail).toBe(true);
    expect(offline.safety.alarms).toEqual([]);
  });

  test('POST /commands answers 400 for comms send on the linked ship', async ({
    nexus,
  }) => {
    const send = json({ system: 'comms', action: 'send' });
    expect(await call(nexus, 'POST', '/commands', send)).toEqual(refusal);
    expect(nexus.get(SHIP_STATE).log()).toEqual([]);
  });

  test('POST /commands answers 400 for comms send on the offline ship', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    const send = json({ system: 'comms', action: 'send' });
    expect(await call(ship, 'POST', '/commands', send)).toEqual(refusal);
  });
});
