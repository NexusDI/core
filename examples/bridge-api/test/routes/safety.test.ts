import { Nexus } from '@nexusdi/core';
import { SHIP_STATE, type ShipReading } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect } from 'vitest';

import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { test } from '../fixtures';
import { calls, json, scopedShip } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the door commands on %s', (framework) => {
  const call = calls[framework];
  const door = (action: 'open' | 'close', id: string) =>
    json({ system: 'safety', action, door: id });

  test('POST /commands answers the flight log entry of an opened door', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    expect(
      await call(ship, 'POST', '/commands', door('open', 'bridge-habitat'), {
        scopes,
      }),
    ).toEqual({
      status: 202,
      body: { tick: 1, flightLog: ['survey-7: opened bridge-habitat'] },
    });
  });

  test('POST /commands records the entry under the request mission', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    expect(
      await call(
        ship,
        'POST',
        '/commands',
        door('open', 'bridge-habitat'),
        { scopes },
        { 'x-mission-id': 'survey-9' },
      ),
    ).toEqual({
      status: 202,
      body: { tick: 1, flightLog: ['survey-9: opened bridge-habitat'] },
    });
  });

  test('POST /commands answers the tick alone without scopes', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    expect(
      await call(ship, 'POST', '/commands', door('open', 'bridge-habitat')),
    ).toEqual({ status: 202, body: { tick: 1 } });
  });

  test('POST /commands answers 409 for the outer door at sea-level pressure', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    expect(
      await call(ship, 'POST', '/commands', door('open', 'airlock-outer'), {
        scopes,
      }),
    ).toEqual({
      status: 409,
      body: {
        code: 'MERIDIAN_INTERLOCK',
        message:
          'The airlock-outer door holds 101,300 Pa of difference, above the 5,000 Pa interlock.',
        fix: 'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
      },
    });
  });

  test('POST /commands records a closed door, which the interlock never holds', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    expect(
      await call(ship, 'POST', '/commands', door('close', 'airlock-outer'), {
        scopes,
      }),
    ).toEqual({
      status: 202,
      body: { tick: 1, flightLog: ['survey-7: closed airlock-outer'] },
    });
  });
});

describe.each(FRAMEWORKS)('the safety commands on %s', (framework) => {
  const call = calls[framework];
  const SAFETY =
    'open and close with a door of bridge-habitat, habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a compartment of bridge, habitat or reactor-bay';
  const refused = (action: string, argument: 'door' | 'compartment') => ({
    status: 400,
    body: {
      code: 'MERIDIAN_BAD_COMMAND',
      message: `safety ${action} cannot use the ${argument} argument. It takes ${SAFETY}.`,
      fix: 'send the arguments in the ranges above.',
    },
  });

  test('POST /commands answers 400 naming the doors for a door the deck lacks', async ({
    nexus,
  }) => {
    const galley = json({ system: 'safety', action: 'open', door: 'galley' });
    expect(await call(nexus, 'POST', '/commands', galley)).toEqual(
      refused('open', 'door'),
    );
    expect(nexus.get(SHIP_STATE).log()).toEqual([]);
  });

  test.for(['flood', 'drill'])(
    'POST /commands answers 400 for %s of the airlock, which holds no charge',
    async (action, { nexus }) => {
      const airlock = json({
        system: 'safety',
        action,
        compartment: 'airlock',
      });
      expect(await call(nexus, 'POST', '/commands', airlock)).toEqual(
        refused(action, 'compartment'),
      );
      expect(nexus.get(SHIP_STATE).log()).toEqual([]);
    },
  );

  test('POST /commands queues a drill at tick 0 and records no flight log entry', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const drill = json({
      system: 'safety',
      action: 'drill',
      compartment: 'habitat',
    });
    expect(await call(ship, 'POST', '/commands', drill, { scopes })).toEqual({
      status: 202,
      body: { tick: 1 },
    });
  });

  test('GET /sim at tick 0 shows no alarm and every door and drill false', async ({
    nexus,
  }) => {
    const { status, body } = await call(nexus, 'GET', '/sim');
    expect(status).toBe(200);
    const ship = body as ShipReading;
    expect(ship.safety.alarms).toEqual([]);
    expect(ship.setpoints.safety.doors).toEqual({
      'bridge-habitat': false,
      'habitat-reactor-bay': false,
      'habitat-airlock': false,
      'airlock-outer': false,
    });
    expect(ship.setpoints.safety.drills).toEqual({
      bridge: false,
      habitat: false,
      'reactor-bay': false,
    });
  });

  test('GET /safety answers an empty 404, as safety rides /commands and /sim', async ({
    nexus,
  }) => {
    expect(await call(nexus, 'GET', '/safety')).toEqual({
      status: 404,
      body: undefined,
    });
  });
});
