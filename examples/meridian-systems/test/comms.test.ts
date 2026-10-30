import { Nexus } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Comms } from '../src/systems/comms/comms.module';
import { Tactical } from '../src/systems/tactical/tactical.module';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { COMMS_ARRAY } from '../src/systems/comms/contracts';
import { NAV_CHARTS } from '../src/systems/tactical/contracts';
import { BUNDLED_CHARTS } from '../src/systems/tactical/star-charts';

import { shipRoot } from './ship-root';
import { shipTest } from './fixtures';
import { loadOf, RELAY_URL, throttle } from './support';

/** The system modules whose tokens these cases read from the root. */
const READS = [Comms, Tactical];
const test = shipTest(shipRoot({ reads: READS }));

const hail = (desk: ICommandDesk) =>
  desk.submit({ system: 'comms', action: 'hail' });

/** The comms load the router allocated on `ship`. */
const commsLoad = (ship: ShipSnapshot) => loadOf(ship, 'comms');

const REPLY = { from: 'fleet traffic control', text: 'sector clear' };

/** Stubs fetch to answer the bundled charts, and returns the URLs it saw. */
function stubRelay(): string[] {
  const fetched: string[] = [];
  vi.stubGlobal('fetch', (url: URL | string) => {
    fetched.push(String(url));
    return Promise.resolve(Response.json(BUNDLED_CHARTS));
  });
  return fetched;
}

/** The relay graph, which downloads its charts at build. */
const relayGraph = () => shipRoot({ reads: READS, relayUrl: RELAY_URL });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('comms on the offline ship', () => {
  test('passes the check and plots a course over the bundled charts', ({
    nexus: ship,
  }) => {
    expect(() => Nexus.check(shipRoot({ reads: READS }))).not.toThrow();
    expect(ship.get(COMMS_ARRAY).linked).toBe(false);
    expect(ship.get(NAV_CHARTS).plot('Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
  });

  test('keeps a hail queued under no subspace link at 0 W with no alarm', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    expect(hail(desk)).toEqual({ tick: 1 });

    const offline = (at: ShipSnapshot) => {
      expect(at.comms).toEqual({
        status: 'no subspace link',
        sent: null,
        messages: [],
      });
      expect(at.setpoints.comms).toEqual({ hail: true });
      expect(commsLoad(at)).toEqual({
        id: 'comms',
        priority: 3,
        demand: 0,
        allocated: 0,
      });
      expect(at.power.shed).toEqual([]);
      expect(at.safety.alarms).toEqual([]);
    };
    offline(loop.advance(1));
    offline(loop.advance(19));
    expect(hail(desk)).toEqual({ tick: 21 });
    const end = loop.advance(580);
    expect(end.tick).toBe(600);
    offline(end);
    expect(
      ship
        .get(SHIP_STATE)
        .log()
        .map((entry) => entry.tick),
    ).toEqual([1, 21]);
  });

  test('refuses comms send and lists comms among the systems', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    expect(() => desk.submit({ system: 'comms', action: 'send' })).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'action',
        expected: 'hail with no arguments',
      }),
    );
    expect(() =>
      desk.submit({ system: 'warp-core', action: 'engage' }),
    ).toThrow(
      expect.objectContaining({
        reason: 'system',
        expected: 'comms, engineering, helm, life-support, safety and weapons',
      }),
    );
  });
});

describe('comms on the relay graph', () => {
  it('opens the link and downloads the charts once at build, and never during a tick', async () => {
    const fetched = stubRelay();
    await using ship = await Nexus.create(relayGraph());
    expect(fetched).toEqual([
      // The charts factory runs in the build, and onInit runs after it.
      'https://relay.test/charts?frequency=1420',
      'https://relay.test/handshake?frequency=1420',
    ]);
    expect(ship.get(COMMS_ARRAY).linked).toBe(true);
    throttle(ship.get(COMMAND_DESK), 0.01);
    hail(ship.get(COMMAND_DESK));
    ship.get(TICK_LOOP).advance(10);
    expect(fetched).toHaveLength(2);
  });

  it('sends a hail at tick 1 with 5 MW and takes the reply at tick 5', async () => {
    stubRelay();
    await using ship = await Nexus.create(relayGraph());
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    expect(throttle(desk, 0.01)).toEqual({ tick: 1 });
    expect(hail(desk)).toEqual({ tick: 1 });

    const sent = loop.advance(1);
    expect(sent.comms).toEqual({
      status: 'awaiting reply',
      sent: 1,
      messages: [],
    });
    expect(commsLoad(sent)).toEqual({
      id: 'comms',
      priority: 3,
      demand: 5_000_000,
      allocated: 5_000_000,
    });
    expect(sent.power.output).toBe(12_100_000);
    for (let tick = 2; tick <= 4; tick++) {
      expect(commsLoad(loop.advance(1))?.demand).toBe(0);
    }
    const reply = loop.advance(1);
    expect(reply.tick).toBe(5);
    expect(reply.comms).toEqual({
      status: 'standby',
      sent: 1,
      messages: [{ tick: 5, ...REPLY }],
    });
    expect(ship.get(SHIP_STATE).log()).toEqual([
      {
        tick: 1,
        change: { reactor: { throttle: 0.01 }, comms: { hail: true } },
      },
    ]);
  });

  it('sheds the hail on a cold reactor and sends it once the reactor gives power', async () => {
    stubRelay();
    await using ship = await Nexus.create(relayGraph());
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    hail(desk);
    for (let tick = 1; tick <= 3; tick++) {
      const cold = loop.advance(1);
      expect(cold.comms.status).toBe('no power');
      expect(cold.setpoints.comms).toEqual({ hail: true });
      expect(commsLoad(cold)).toMatchObject({
        demand: 5_000_000,
        allocated: 0,
      });
      expect(cold.power.shed).toEqual(['comms']);
      expect(cold.safety.alarms).toEqual([
        { code: 'LOAD_SHED', subject: 'comms', acknowledged: false },
      ]);
    }
    expect(throttle(desk, 0.01)).toEqual({ tick: 4 });
    const warm = loop.advance(1);
    expect(warm.comms).toMatchObject({ status: 'awaiting reply', sent: 4 });
    expect(commsLoad(warm)?.allocated).toBe(5_000_000);
    expect(warm.power.shed).toEqual([]);
    expect(warm.safety.alarms).toEqual([]);
    const reply = loop.advance(4);
    expect(reply.tick).toBe(8);
    expect(reply.comms.messages).toEqual([{ tick: 8, ...REPLY }]);
  });

  it('holds a second hail behind the outstanding reply and sends it the tick after', async () => {
    stubRelay();
    await using ship = await Nexus.create(relayGraph());
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    throttle(desk, 0.01);
    hail(desk);
    loop.advance(2);
    expect(hail(desk)).toEqual({ tick: 3 });
    for (let tick = 3; tick <= 4; tick++) {
      const waiting = loop.advance(1);
      expect(waiting.comms).toMatchObject({
        status: 'awaiting reply',
        sent: 1,
      });
      expect(waiting.setpoints.comms).toEqual({ hail: true });
      expect(commsLoad(waiting)?.demand).toBe(0);
    }
    const reply = loop.advance(1);
    expect(reply.comms).toEqual({
      status: 'standby',
      sent: 1,
      messages: [{ tick: 5, ...REPLY }],
    });
    expect(reply.setpoints.comms).toEqual({ hail: true });
    expect(commsLoad(reply)?.demand).toBe(0);
    const resent = loop.advance(1);
    expect(resent.comms).toMatchObject({ status: 'awaiting reply', sent: 6 });
    expect(resent.setpoints.comms).toEqual({ hail: false });
    expect(commsLoad(resent)?.demand).toBe(5_000_000);
    const second = loop.advance(4);
    expect(second.tick).toBe(10);
    expect(second.comms.status).toBe('standby');
    expect(second.comms.messages.map((message) => message.tick)).toEqual([
      5, 10,
    ]);
    expect(
      ship
        .get(SHIP_STATE)
        .log()
        .map((entry) => entry.tick),
    ).toEqual([1, 3]);
  });

  it('keeps the newest 10 messages of eleven hails', async () => {
    stubRelay();
    await using ship = await Nexus.create(relayGraph());
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    throttle(desk, 0.01);
    let last = ship.get(SHIP_STATE).snapshot();
    for (let round = 0; round < 11; round++) {
      hail(desk);
      last = loop.advance(5);
    }
    expect(last.tick).toBe(55);
    expect(last.comms.sent).toBe(51);
    expect(last.comms.messages).toHaveLength(10);
    expect(last.comms.messages[0]).toEqual({ tick: 10, ...REPLY });
    expect(last.comms.messages.at(-1)).toEqual({ tick: 55, ...REPLY });
  });
});
