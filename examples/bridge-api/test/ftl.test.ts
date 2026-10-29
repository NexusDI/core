import {
  FTL_DRIVE,
  type ICommandDesk,
  type IShipState,
  type IShipSystem,
  type ITickLoop,
  type ShipReading,
  type ShipSnapshot,
  type TickContext,
} from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, test } from 'vitest';

import { servers } from '../e2e/servers';
import type { TelemetryFrame } from '../src/ship/contracts';
import { FtlDrive, OfflineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FakeFtlDrive, FakeJumpDrive } from './doubles';
import { calls, json, type Payload, scopedShip } from './route-helpers';
import { events } from './sse';
import { FRAMEWORKS } from './support';

/** Reads `stream`'s snapshot frames until the one at `tick`. */
async function frameAt(
  stream: ReturnType<typeof events>,
  tick: number,
): Promise<TelemetryFrame> {
  for (;;) {
    const message = await stream.next();
    expect(message?.event).toBe('snapshot');
    const frame = JSON.parse(message?.data ?? '') as TelemetryFrame;
    if (frame.tick >= tick) return frame;
  }
}

describe.each(FRAMEWORKS)('the telemetry stream on %s', (framework) => {
  test('sends the rating of the drive a section request loads after the stream opened', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const bridge = await servers[framework](ship, scopes);
    const post = (path: string, payload?: Payload) =>
      fetch(`${bridge.url}${path}`, {
        method: 'POST',
        ...(payload === undefined
          ? {}
          : {
              headers: { 'content-type': payload.type },
              body: payload.text,
            }),
      });
    try {
      const abort = new AbortController();
      const stream = events(
        await fetch(`${bridge.url}/telemetry`, { signal: abort.signal }),
      );
      const first = await frameAt(stream, 0);
      expect(first.tick).toBe(0);
      expect(first.ftl?.status).toBe('offline');
      expect(first).not.toHaveProperty('ftlRating');

      expect((await post('/sections/ftl')).status).toBe(200);
      expect((await post('/sim/advance', json({ ticks: 1 }))).status).toBe(200);
      const loaded = await frameAt(stream, 1);
      expect(loaded.tick).toBe(1);
      expect(loaded.ftl?.status).toBe('idle');
      expect(loaded.ftlRating).toEqual({
        energy: 90_000_000_000,
        power: 900_000_000,
        pulseShare: 0.1,
        reactorLevel: 0.9,
        coolantLimit: 1_300,
      });
      abort.abort();
    } finally {
      await bridge.close();
    }
  });
});

/** The offline ship with FakeFtlDrive standing in for the FTL drive at load(). */
const simulatedShip = () =>
  createTestingContainer(OfflineMeridian)
    .overrideModule(FtlDrive, FakeFtlDrive, { lazy: true })
    .create({ plugins: bridgePlugins() });

describe.each(FRAMEWORKS)('the simulated drive on %s', (framework) => {
  const call = calls[framework];

  test('a spool on a cold reactor and a jump move the ship with no charge to wait for', async () => {
    await using ship = await simulatedShip();
    const advance = () =>
      call(ship, 'POST', '/sim/advance', json({ ticks: 1 }));
    const ftl = (action: string, args: object = {}) =>
      call(ship, 'POST', '/commands', json({ system: 'ftl', action, ...args }));
    expect((await call(ship, 'POST', '/sections/ftl')).status).toBe(200);
    expect(await ftl('spool')).toEqual({ status: 202, body: { tick: 1 } });
    await advance();
    expect(await ftl('jump', { to: 'Proxima-b' })).toEqual({
      status: 202,
      body: { tick: 2 },
    });
    await advance();
    const reading = (await call(ship, 'GET', '/sim')).body as ShipReading;
    expect(reading.ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'Proxima-b',
      jumped: 2,
    });
    expect(reading.setpoints.ftl).toEqual({ armed: false, jump: null });
    expect(reading.power.loads).toHaveLength(6);
    expect(reading.coolant.temperature).toBe(500);
    expect(ship.get(FTL_DRIVE)).toBeInstanceOf(FakeJumpDrive);
  });

  test('the telemetry stream sends the rating of the simulated drive', async () => {
    await using ship = await simulatedShip();
    const bridge = await servers[framework](ship);
    try {
      const abort = new AbortController();
      const stream = events(
        await fetch(`${bridge.url}/telemetry`, { signal: abort.signal }),
      );
      const first = await frameAt(stream, 0);
      expect(first.ftl?.status).toBe('offline');
      expect(first).not.toHaveProperty('ftlRating');
      expect(
        (await fetch(`${bridge.url}/sections/ftl`, { method: 'POST' })).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${bridge.url}/commands`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ system: 'ftl', action: 'spool' }),
          })
        ).status,
      ).toBe(202);
      await fetch(`${bridge.url}/sim/advance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticks: 1 }),
      });
      const loaded = await frameAt(stream, 1);
      expect(loaded.ftl?.status).toBe('charged');
      expect(loaded.ftlRating?.power).toBe(0);
      abort.abort();
    } finally {
      await bridge.close();
    }
  });
});

test('an override of the FTL drive without lazy fails create() as unused', async () => {
  let thrown: unknown;
  try {
    await createTestingContainer(OfflineMeridian)
      .overrideModule(FtlDrive, FakeFtlDrive)
      .create({ plugins: bridgePlugins() });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({
    code: 'NEXUS_BLUEPRINT_INVALID',
    errors: [{ code: 'NEXUS_OVERRIDE_UNUSED', token: 'FtlDrive' }],
  });
});

test('the simulated drive writes idle once after the load and keeps a charged armed ship', () => {
  let system: IShipSystem | undefined;
  const loop = {
    register(registered: IShipSystem) {
      system = registered;
      return () => {};
    },
  } as unknown as ITickLoop;
  const desk = { register: () => () => {} } as unknown as ICommandDesk;
  new FakeJumpDrive(loop, {} as IShipState, desk).onInit();
  const step = (ship: ShipSnapshot) =>
    system?.step(ship, { tick: 1 } as TickContext);
  const shipAt = (status: 'offline' | 'charged', armed: boolean) =>
    ({
      ftl: { status, charge: 0, sector: 'Sol', jumped: null },
      setpoints: { ftl: { armed, jump: null } },
    }) as unknown as ShipSnapshot;

  const offline = shipAt('offline', false);
  const idle = step(offline);
  expect(idle?.ftl).toEqual({ ...offline.ftl, status: 'idle' });
  expect(idle && step(idle)).toBe(idle);
  const charged = shipAt('charged', true);
  expect(step(charged)).toBe(charged);
});
