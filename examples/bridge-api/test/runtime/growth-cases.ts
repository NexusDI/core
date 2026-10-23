import {
  COMPARTMENT_IDS,
  GASES,
  type ShipReading,
} from '@nexusdi/meridian-systems';

/** A `fetch` against one bridge: `path` starts with `/`. */
export type BridgeFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * One growth case. `run` throws an `Error` that names the first mismatch.
 * Each case expects a fresh `OfflineMeridian` ship, manual at seed 7 and
 * dt 0.5, behind `fetch`. The ship's `bridgePlugins` and the bridge share one
 * `nodeScopes()`, so the interlock and the flight recorder run.
 */
export interface GrowthCase {
  readonly name: string;
  run(fetch: BridgeFetch): Promise<void>;
}

function expectEqual(what: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
    );
}

/** Reads the JSON body of `res` after its status matched 200. */
async function okJson<T>(what: string, res: Response): Promise<T> {
  expectEqual(`${what} status`, res.status, 200);
  return (await res.json()) as T;
}

/** The init of a POST that sends `body` as JSON. */
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** A command for the desk: `system` and `action` with their arguments. */
const command = (system: string, action: string, args: object = {}) => ({
  system,
  action,
  ...args,
});
const pump = (mode: string) =>
  command('life-support', 'pump', { compartment: 'airlock', mode });
const vent = (open: boolean) =>
  command('life-support', 'vent', { compartment: 'airlock', open });
const door = (action: string, id: string) =>
  command('safety', action, { door: id });

/** Posts `command` and checks the status and body the desk answers. */
async function send(
  fetch: BridgeFetch,
  command: { action: string },
  status: number,
  expected: object,
): Promise<void> {
  const res = await fetch('/commands', json(command));
  expectEqual(`${command.action} status`, res.status, status);
  expectEqual(`${command.action} answer`, await res.json(), expected);
}

/** Opens door `id` and checks that the interlock refuses it. */
async function refused(fetch: BridgeFetch, id: string): Promise<void> {
  const res = await fetch('/commands', json(door('open', id)));
  expectEqual(`open ${id} status`, res.status, 409);
  const answer = (await res.json()) as { code: string; message: string };
  expectEqual(`open ${id} code`, answer.code, 'MERIDIAN_INTERLOCK');
  const message = new RegExp(`^The ${id} door holds [\\d,]+ Pa of difference`);
  if (!message.test(answer.message))
    throw new Error(`open ${id} message: got ${answer.message}`);
}

/**
 * Advances the ship `ticks` to `tick`, reads it with GET /sim and checks that
 * no room raises an alarm.
 */
async function advanceTo(
  fetch: BridgeFetch,
  ticks: number,
  tick: number,
): Promise<ShipReading> {
  await okJson(
    'POST /sim/advance',
    await fetch('/sim/advance', json({ ticks })),
  );
  const ship = await okJson<ShipReading>('GET /sim', await fetch('/sim'));
  expectEqual('tick', ship.tick, tick);
  expectEqual(`alarms at tick ${tick}`, ship.safety.alarms, []);
  return ship;
}

/** Checks that `value` lies from `low` to `high`. */
function expectWithin(what: string, value: number, low: number, high: number) {
  if (!(value >= low && value <= high))
    throw new Error(`${what}: got ${value}, want ${low} to ${high}`);
}

/**
 * The airlock drill on fixed tick counts from tick 0, each read far from the
 * interlock's 5,000 Pa. Seed 7 gives the airlock 9,089 Pa at tick 300 after
 * the pump-down, 3,949 Pa at tick 340 after the vent, and a 410 Pa gap to the
 * habitat at tick 474 after the fill.
 */
export const airlockDrill: GrowthCase = {
  name: 'the airlock drill pumps the airlock down and vents it to space, then refills it under the interlock',
  async run(fetch) {
    const queued = (tick: number) => ({ tick });
    const logged = (tick: number, line: string) => ({
      tick,
      flightLog: [`survey-7: ${line}`],
    });
    await send(
      fetch,
      command('engineering', 'throttle', { level: 0.01 }),
      202,
      queued(1),
    );
    await send(fetch, command('life-support', 'online'), 202, queued(1));
    await send(fetch, pump('evacuate'), 202, queued(1));

    let ship = await advanceTo(fetch, 300, 300);
    expectWithin(
      'airlock at tick 300',
      ship.compartments.airlock.pressure,
      8_500,
      9_500,
    );
    await refused(fetch, 'airlock-outer');
    await send(fetch, pump('off'), 202, queued(301));
    await send(fetch, vent(true), 202, queued(301));

    ship = await advanceTo(fetch, 40, 340);
    expectWithin(
      'airlock at tick 340',
      ship.compartments.airlock.pressure,
      3_500,
      4_500,
    );
    await send(
      fetch,
      door('open', 'airlock-outer'),
      202,
      logged(341, 'opened airlock-outer'),
    );

    ship = await advanceTo(fetch, 20, 360);
    expectWithin(
      'airlock at tick 360',
      ship.compartments.airlock.pressure,
      0,
      100,
    );
    expectEqual(
      'airlock-outer at tick 360',
      ship.setpoints.safety.doors['airlock-outer'],
      true,
    );
    await send(
      fetch,
      door('close', 'airlock-outer'),
      202,
      logged(361, 'closed airlock-outer'),
    );
    await send(fetch, vent(false), 202, queued(361));
    await send(fetch, pump('fill'), 202, queued(361));
    await refused(fetch, 'habitat-airlock');

    ship = await advanceTo(fetch, 114, 474);
    const { habitat, airlock: room } = ship.compartments;
    expectWithin(
      'gap at tick 474',
      Math.abs(habitat.pressure - room.pressure),
      0,
      2_500,
    );
    await send(fetch, pump('off'), 202, queued(475));
    await send(
      fetch,
      door('open', 'habitat-airlock'),
      202,
      logged(475, 'opened habitat-airlock'),
    );

    ship = await advanceTo(fetch, 20, 494);
    expectEqual(
      'habitat-airlock at tick 494',
      ship.setpoints.safety.doors['habitat-airlock'],
      true,
    );
    const end = ship.compartments;
    expectWithin(
      'gap at tick 494',
      Math.abs(end.habitat.pressure - end.airlock.pressure),
      0,
      500,
    );
    const log = await okJson<{ tick: number }[]>(
      'GET /commands',
      await fetch('/commands'),
    );
    expectEqual(
      'command log ticks',
      log.map((entry) => entry.tick),
      [1, 301, 341, 361, 475],
    );
  },
};

/**
 * Checks what the offline ship holds from the first hail to the last tick: the
 * array reports no subspace link and asks for 0 W, and the hail stays queued.
 */
function expectOfflineArray(ship: ShipReading, tick: number): void {
  expectEqual(`comms at tick ${tick}`, ship.comms, {
    status: 'no subspace link',
    sent: null,
    messages: [],
  });
  expectEqual(`hail flag at tick ${tick}`, ship.setpoints.comms.hail, true);
  expectEqual(
    `comms load at tick ${tick}`,
    ship.power.loads.find((load) => load.id === 'comms'),
    { id: 'comms', priority: 3, demand: 0, allocated: 0 },
  );
}

/**
 * The offline ship, which binds no subspace link, takes a hail at tick 0 and a
 * second one at tick 20. Its array reports `no subspace link` and keeps the
 * hail queued up to tick 600, with no alarm and 0 W of load.
 */
export const offlineHail: GrowthCase = {
  name: 'a hail on the offline ship reports no subspace link and keeps its queue',
  async run(fetch) {
    const hail = command('comms', 'hail');
    await send(fetch, hail, 202, { tick: 1 });

    expectOfflineArray(await advanceTo(fetch, 20, 20), 20);
    await send(fetch, hail, 202, { tick: 21 });

    expectOfflineArray(await advanceTo(fetch, 580, 600), 600);
    const log = await okJson<{ tick: number }[]>(
      'GET /commands',
      await fetch('/commands'),
    );
    expectEqual(
      'command log ticks',
      log.map((entry) => entry.tick),
      [1, 21],
    );
  },
};

/**
 * The course and the burn on the offline ship. At tick 11 the crew steers for
 * Kepler-442b, and the helm turns the ship and settles on 0.733 rad at
 * tick 697, 103 ticks before the read at tick 800. The burn at tick 801 then
 * runs along an attitude that equals the course exactly, so the drive reads no
 * cosine of a non-zero angle and every read compares the same figures on
 * every engine.
 */
export const courseAndBurn: GrowthCase = {
  name: 'a course and a burn on the offline ship settle the helm on the charted heading and drive the ship along it',
  async run(fetch) {
    await send(fetch, command('engineering', 'throttle', { level: 0.6 }), 202, {
      tick: 1,
    });
    await advanceTo(fetch, 10, 10);
    await send(fetch, command('helm', 'course', { to: 'Kepler-442b' }), 202, {
      tick: 11,
    });

    let ship = await advanceTo(fetch, 790, 800);
    expectEqual('helm at tick 800', ship.helm, {
      attitude: 0.733,
      rate: 0,
      torque: 0,
    });
    expectEqual('heading at tick 800', ship.setpoints.helm.heading, 0.733);
    expectEqual(
      'helm loads at tick 800',
      ship.power.loads
        .filter((load) => load.id === 'thrusters' || load.id === 'main-drive')
        .map(({ id, demand, allocated }) => ({ id, demand, allocated })),
      [
        { id: 'thrusters', demand: 0, allocated: 0 },
        { id: 'main-drive', demand: 0, allocated: 0 },
      ],
    );
    await send(fetch, command('helm', 'burn', { level: 1 }), 202, {
      tick: 801,
    });

    ship = await advanceTo(fetch, 400, 1200);
    expectEqual('drive at tick 1200', ship.drive, {
      thrust: 14_400,
      massFlow: 0.288,
      acceleration: 0.0036,
      velocity: 0.72,
      distance: 72.18,
    });
    expectEqual(
      'main-drive at tick 1200',
      ship.power.loads.find((load) => load.id === 'main-drive'),
      {
        id: 'main-drive',
        priority: 5,
        demand: 600_000_000,
        allocated: 600_000_000,
      },
    );
    const answer = await fetch('/commands');
    const ticks = (
      await okJson<{ tick: number }[]>('GET /commands', answer)
    ).map(({ tick }) => tick);
    expectEqual('command log ticks', ticks, [1, 11, 801]);
  },
};

/**
 * The cases bridge-api's e2e-growth target runs on workerd
 * (test/worker/growth/sim.test.ts), Deno and Bun (test/runtime/growth.ts).
 * Each case this file exports by name also runs on the Node servers
 * (e2e/growth/airlock.e2e.ts, e2e/growth/comms.e2e.ts and
 * e2e/growth/helm.e2e.ts).
 */
export const growthCases: readonly GrowthCase[] = [
  {
    name: 'GET /sim reads tick 0 with four compartments of moles, temperature and pressure',
    async run(fetch) {
      const ship = await okJson<ShipReading>('GET /sim', await fetch('/sim'));
      expectEqual('tick', ship.tick, 0);
      expectEqual('time', ship.time, 0);
      expectEqual(
        'compartments',
        Object.keys(ship.compartments),
        COMPARTMENT_IDS,
      );
      for (const id of COMPARTMENT_IDS) {
        const room = ship.compartments[id];
        expectEqual(`${id} gases`, Object.keys(room.moles), GASES);
        for (const gas of GASES)
          expectEqual(
            `${id} ${gas} is a positive number`,
            typeof room.moles[gas] === 'number' && room.moles[gas] > 0,
            true,
          );
        expectEqual(
          `${id} temperature is a number`,
          typeof room.temperature,
          'number',
        );
        // Every compartment starts at the deck plan's 101.3 kPa.
        expectEqual(`${id} pressure`, room.pressure, 101_300);
      }
    },
  },
  {
    name: 'POST /sim/advance of 600 ticks reaches tick 600 at time 300, 293 K and 101.3 kPa',
    async run(fetch) {
      const advanced = await okJson<{ tick: number; time: number }>(
        'POST /sim/advance',
        await fetch('/sim/advance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ticks: 600 }),
        }),
      );
      expectEqual('advanced tick', advanced.tick, 600);
      expectEqual('advanced time', advanced.time, 300);
      const ship = await okJson<ShipReading>('GET /sim', await fetch('/sim'));
      expectEqual('tick', ship.tick, 600);
      // The idle ship has no system yet, so the air holds the deck's 293 K.
      expectEqual(
        'habitat temperature',
        ship.compartments.habitat.temperature,
        293,
      );
      expectEqual(
        'habitat pressure',
        ship.compartments.habitat.pressure,
        101_300,
      );
    },
  },
  {
    name: 'GET /telemetry sends a snapshot at tick 0, then the client cancels',
    async run(fetch) {
      const res = await fetch('/telemetry');
      expectEqual('GET /telemetry status', res.status, 200);
      expectEqual(
        'content-type',
        res.headers.get('content-type'),
        'text/event-stream',
      );
      if (res.body === null) throw new Error('GET /telemetry sent no body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (!text.includes('\n\n')) {
        const { done, value } = await reader.read();
        if (done)
          throw new Error('GET /telemetry ended before its first frame');
        text += decoder.decode(value, { stream: true });
      }
      await reader.cancel();
      const frame = text.slice(0, text.indexOf('\n\n'));
      const [event, data] = frame.split('\n');
      expectEqual('first event', event, 'event: snapshot');
      if (!data?.startsWith('data: '))
        throw new Error(
          `first frame has no data line: ${JSON.stringify(frame)}`,
        );
      expectEqual(
        'first frame tick',
        (JSON.parse(data.slice('data: '.length)) as ShipReading).tick,
        0,
      );
    },
  },
  airlockDrill,
  offlineHail,
  courseAndBurn,
];
