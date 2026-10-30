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

/** Posts `body` to `path` and checks the status and answer; `what` names the step. */
async function post(
  fetch: BridgeFetch,
  what: string,
  path: string,
  body: unknown,
  status: number,
  expected: object,
): Promise<void> {
  const res = await fetch(path, json(body));
  expectEqual(`${what} status`, res.status, status);
  expectEqual(`${what} answer`, await res.json(), expected);
}

/** Posts `command` and checks the status and body the desk answers. */
function send(
  fetch: BridgeFetch,
  command: { action: string },
  status: number,
  expected: object,
): Promise<void> {
  return post(fetch, command.action, '/commands', command, status, expected);
}

/** The notice a hail on the offline ship carries, with the fix of bridge-api's table. */
const NO_LINK_NOTICE = {
  code: 'MERIDIAN_NO_SUBSPACE_LINK',
  message:
    'The ship binds no SUBSPACE_LINK, so the hail waits under "no subspace link".',
  fix: 'Start the relay with `npx nx run @nexusdi/bridge-api:dev-relay` and set RELAY_URL to its address, or run `npx nx run @nexusdi/bridge-api:dev`, which starts both.',
};

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
 * the pump-down, 3,949 Pa at tick 340 after the vent, and a 384 Pa gap to the
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
    await send(fetch, hail, 202, { tick: 1, notice: NO_LINK_NOTICE });

    expectOfflineArray(await advanceTo(fetch, 20, 20), 20);
    await send(fetch, hail, 202, { tick: 21, notice: NO_LINK_NOTICE });

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
 * Kepler-442b, and the helm turns the ship and settles on 0.73303829 rad at
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
    const uncharted = await fetch('/course/Vega');
    expectEqual('GET /course/Vega status', uncharted.status, 404);
    expectEqual('GET /course/Vega answer', await uncharted.json(), {
      code: 'MERIDIAN_UNCHARTED',
      message: "No star is charted as 'Vega'.",
      fix: 'plot a course to a charted star: Kepler-442b, Proxima-b, TRAPPIST-1e.',
    });

    let ship = await advanceTo(fetch, 790, 800);
    expectEqual('helm at tick 800', ship.helm, {
      attitude: 0.73303829,
      rate: 0,
      torque: 0,
    });
    expectEqual('heading at tick 800', ship.setpoints.helm.heading, 0.73303829);
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
 * The spool and the jump on the offline ship. The desk refuses `ftl` until
 * `POST /sections/ftl` loads the drive. The reactor is cold at tick 0, so the
 * first spool finds no power. The spool at tick 101 charges 450 MJ a tick and
 * holds 90 GJ at tick 300. A second spool at tick 300 queues nothing, and a jump to
 * a star the charts lack is refused. The jump to Kepler-442b at tick 301 moves
 * the sector and empties the charge. Every value is an integer or a string,
 * and `jumped` reads null before the jump, so each read compares exactly on
 * every engine.
 */
export const spoolAndJump: GrowthCase = {
  name: 'a spool and a jump on the offline ship charge the drive and move the ship to the charted star',
  async run(fetch) {
    const spool = (ship: ShipReading) =>
      ship.power.loads.find((load) => load.id === 'ftl-spool');
    await send(fetch, command('ftl', 'spool'), 400, {
      code: 'MERIDIAN_BAD_COMMAND',
      message:
        "No ship system is named 'ftl'. The desk serves comms, engineering, helm, life-support, safety and weapons.",
      fix: 'send the command to one of the systems above.',
    });
    await post(fetch, 'ftl section', '/sections/ftl', undefined, 200, {
      rating: {
        energy: 90_000_000_000,
        power: 900_000_000,
        pulseShare: 0.1,
        reactorLevel: 0.9,
        coolantLimit: 1_300,
      },
    });
    await send(fetch, command('engineering', 'throttle', { level: 1 }), 202, {
      tick: 1,
    });
    await send(fetch, command('ftl', 'spool'), 409, {
      code: 'MERIDIAN_POWER_BUDGET',
      message:
        'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.',
      fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
    });

    // Tick 1 applies the throttle. The reactor is still climbing, so the
    // fix tells the reader to wait. It names no loads, since none holds power.
    await advanceTo(fetch, 1, 1);
    await send(fetch, command('ftl', 'spool'), 409, {
      code: 'MERIDIAN_POWER_BUDGET',
      message:
        'The ftl-spool load needs 900 MW, and the router has 12.1 MW free beside the loads above it.',
      fix: 'the reactor is at full throttle, so wait for the output to climb.',
    });

    // Life support holds power ahead of the spool for one tick, so the
    // refusal at tick 2 names it as the load to lower to spool sooner. The
    // offline order at tick 3 puts the ship back before tick 100.
    await send(fetch, command('life-support', 'online'), 202, { tick: 2 });
    await advanceTo(fetch, 1, 2);
    await send(fetch, command('ftl', 'spool'), 409, {
      code: 'MERIDIAN_POWER_BUDGET',
      message:
        'The ftl-spool load needs 900 MW, and the router has 24.2 MW free beside the loads above it.',
      fix: 'the reactor is at full throttle and still climbing, so wait for the output to climb, or lower a load ahead of the ftl-spool to spool sooner: life-support.',
    });
    await send(fetch, command('life-support', 'offline'), 202, { tick: 3 });

    let ship = await advanceTo(fetch, 98, 100);
    expectEqual('ftl at tick 100', ship.ftl, {
      status: 'idle',
      charge: 0,
      sector: 'Sol',
      jumped: null,
    });
    expectEqual('ftl-spool at tick 100', spool(ship), {
      id: 'ftl-spool',
      priority: 7,
      demand: 0,
      allocated: 0,
    });
    await send(fetch, command('ftl', 'spool'), 202, { tick: 101 });
    await send(fetch, command('ftl', 'jump', { to: 'Kepler-442b' }), 409, {
      code: 'MERIDIAN_FTL_NOT_SPOOLED',
      message: 'The FTL drive holds 0 GJ of the 90 GJ a jump needs.',
      fix: 'spool the drive and wait until it holds the full charge, then jump.',
    });

    ship = await advanceTo(fetch, 200, 300);
    expectEqual('ftl at tick 300', ship.ftl, {
      status: 'charged',
      charge: 90_000_000_000,
      sector: 'Sol',
      jumped: null,
    });
    expectEqual('ftl-spool at tick 300', spool(ship), {
      id: 'ftl-spool',
      priority: 7,
      demand: 900_000_000,
      allocated: 900_000_000,
    });
    await send(fetch, command('ftl', 'spool'), 202, { tick: 301 });
    await send(fetch, command('ftl', 'jump', { to: 'Vega' }), 400, {
      code: 'MERIDIAN_BAD_COMMAND',
      message:
        'ftl jump cannot use the to argument. It takes spool with no arguments and jump with a charted star to jump to.',
      fix: 'send the arguments in the ranges above.',
    });
    await send(fetch, command('ftl', 'jump', { to: 'Kepler-442b' }), 202, {
      tick: 301,
    });

    ship = await advanceTo(fetch, 1, 301);
    expectEqual('ftl at tick 301', ship.ftl, {
      status: 'idle',
      charge: 0,
      sector: 'Kepler-442b',
      jumped: 301,
    });
    expectEqual(
      'command log',
      await okJson('GET /commands', await fetch('/commands')),
      [
        { tick: 1, change: { reactor: { throttle: 1 } } },
        { tick: 2, change: { lifeSupport: { online: true } } },
        { tick: 3, change: { lifeSupport: { online: false } } },
        { tick: 101, change: { ftl: { armed: true } } },
        { tick: 301, change: { ftl: { jump: 'Kepler-442b' } } },
      ],
    );
  },
};

/**
 * Two railgun shots on the offline ship. The reactor is cold at tick 0, so
 * the first fire finds no power and the desk refuses it. Fired at tick 30
 * with the reactor at full throttle, the railgun charges 150 MJ a tick and
 * shoots at 300 MJ, so the first shot leaves at tick 32 and hits at 10 km. The
 * capacitor refills to 400 MJ at tick 35, where the load tapers to 200 MW. A
 * second shot at 50 km leaves at tick 36 and misses. The draws are 0.5777
 * against 0.6550 at 10 km and 0.8633 against a ceiling of 0.8 at 50 km, so no
 * engine can disagree on a hit. Every value is an integer, a boolean, a string or null.
 */
export const fireRailgun: GrowthCase = {
  name: 'two railgun shots on the offline ship charge the capacitor, hit at 10 km and miss at 50 km',
  async run(fetch) {
    const railgun = (ship: ShipReading) =>
      ship.power.loads.find((load) => load.id === 'railgun');
    const load = (demand: number) => ({
      id: 'railgun',
      priority: 6,
      demand,
      allocated: demand,
    });
    const fire = (range: unknown) => command('weapons', 'fire', { range });
    const usage = {
      code: 'MERIDIAN_BAD_COMMAND',
      message:
        'weapons fire cannot use the range argument. It takes fire with a range from 0 to 100,000 m.',
      fix: 'send the arguments in the ranges above.',
    };
    await send(fetch, fire(10_000), 409, {
      code: 'MERIDIAN_POWER_BUDGET',
      message:
        'The railgun load needs 300 MW, and the router has 0 MW free beside the loads above it.',
      fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
    });
    await send(fetch, command('engineering', 'throttle', { level: 1 }), 202, {
      tick: 1,
    });

    let ship = await advanceTo(fetch, 30, 30);
    expectEqual('weapons at tick 30', ship.weapons, {
      status: 'idle',
      charge: 0,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expectEqual('railgun at tick 30', railgun(ship), load(0));
    await send(fetch, fire('far'), 400, usage);
    await send(fetch, fire(100_001), 400, usage);
    await send(fetch, fire(10_000), 202, { tick: 31 });

    ship = await advanceTo(fetch, 1, 31);
    expectEqual('weapons at tick 31', ship.weapons, {
      status: 'charging',
      charge: 150_000_000,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expectEqual('railgun at tick 31', railgun(ship), load(300_000_000));

    ship = await advanceTo(fetch, 1, 32);
    expectEqual('weapons at tick 32', ship.weapons, {
      status: 'charging',
      charge: 0,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });

    ship = await advanceTo(fetch, 3, 35);
    expectEqual('weapons at tick 35', ship.weapons, {
      status: 'charged',
      charge: 400_000_000,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });
    expectEqual('railgun at tick 35', railgun(ship), load(200_000_000));
    await send(fetch, fire(50_000), 202, { tick: 36 });

    ship = await advanceTo(fetch, 1, 36);
    expectEqual('weapons at tick 36', ship.weapons, {
      status: 'charging',
      charge: 100_000_000,
      shots: 2,
      hits: 1,
      lastShot: { tick: 36, range: 50_000, hit: false },
    });
    expectEqual(
      'command log ticks',
      (
        await okJson<{ tick: number }[]>(
          'GET /commands',
          await fetch('/commands'),
        )
      ).map((entry) => entry.tick),
      [1, 31, 36],
    );
  },
};

/** The short id and the pinned ticks of each pinned case, besides `final`. */
const pinnedCases = new Map<string, { id: string; ticks: readonly number[] }>([
  [offlineHail.name, { id: 'hail', ticks: [] }],
  [courseAndBurn.name, { id: 'course', ticks: [800] }],
  [spoolAndJump.name, { id: 'spool', ticks: [300] }],
  [fireRailgun.name, { id: 'weapons', ticks: [35] }],
]);

/** The FNV-1a 32-bit hash of the UTF-8 bytes of `bytes`, as 8 hex digits. */
function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Runs `each` on `fetch` and, for a case that pins `/sim` bodies, prints one `sim-pin` line per pinned body after the case passes:
 * the leg, the case, the tick (or `final`), the UTF-8 length of the body text
 * as the route sent it, and its FNV-1a hash. The line changes no assertion.
 * Every leg runs its cases through this function, so the lines share a format.
 */
export async function runGrowthCase(
  leg: string,
  each: GrowthCase,
  fetch: BridgeFetch,
): Promise<void> {
  const pin = pinnedCases.get(each.name);
  if (pin === undefined) return each.run(fetch);
  const reads: { tick: number; bytes: number; hash: string }[] = [];
  await each.run(async (path, init) => {
    const res = await fetch(path, init);
    if (path === '/sim' && (init?.method ?? 'GET') === 'GET') {
      const text = await res.clone().text();
      const bytes = new TextEncoder().encode(text);
      reads.push({
        tick: (JSON.parse(text) as ShipReading).tick,
        bytes: bytes.length,
        hash: fnv1a(bytes),
      });
    }
    return res;
  });
  const shown = [
    ...pin.ticks.map(
      (tick) =>
        [String(tick), reads.filter((r) => r.tick === tick).at(-1)] as const,
    ),
    ['final', reads.at(-1)] as const,
  ];
  for (const [at, read] of shown)
    console.log(
      read === undefined
        ? `sim-pin leg=${leg} case=${pin.id} at=${at} missing`
        : `sim-pin leg=${leg} case=${pin.id} at=${at} bytes=${read.bytes} fnv1a=${read.hash}`,
    );
}

/** The compartments the deck plan marks unpressurised. */
const VACUUM_BAYS: readonly string[] = ['shuttle-bay', 'drone-bay'];

/**
 * The cases bridge-api's e2e-growth target runs on workerd
 * (test/worker/growth/sim.test.ts), Deno and Bun (test/runtime/growth.ts).
 * Each case this file exports by name also runs on the Node servers
 * (e2e/growth/airlock.e2e.ts, e2e/growth/comms.e2e.ts,
 * e2e/growth/helm.e2e.ts, e2e/growth/ftl.e2e.ts and
 * e2e/growth/weapons.e2e.ts).
 */
export const growthCases: readonly GrowthCase[] = [
  {
    name: 'GET /sim reads tick 0 with fourteen compartments of moles, temperature and pressure',
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
        // The two bays hold vacuum, and every other room starts at the
        // deck plan's 101.3 kPa.
        const vacuum = VACUUM_BAYS.includes(id);
        expectEqual(`${id} gases`, Object.keys(room.moles), GASES);
        for (const gas of GASES)
          expectEqual(
            `${id} ${gas} is ${vacuum ? '0' : 'a positive number'}`,
            typeof room.moles[gas] === 'number' &&
              (vacuum ? room.moles[gas] === 0 : room.moles[gas] > 0),
            true,
          );
        expectEqual(
          `${id} temperature is a number`,
          typeof room.temperature,
          'number',
        );
        expectEqual(`${id} pressure`, room.pressure, vacuum ? 0 : 101_300);
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
  spoolAndJump,
  fireRailgun,
];
