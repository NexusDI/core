import {
  COMPARTMENT_IDS,
  GASES,
  type ShipSnapshot,
} from '@nexusdi/meridian-systems';

/** A `fetch` against one bridge: `path` starts with `/`. */
export type BridgeFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * One growth case. `run` throws an `Error` that names the first mismatch.
 * Each case expects a fresh `OfflineMeridian` ship, manual at seed 7 and
 * dt 0.5, behind `fetch`.
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

/**
 * The cases bridge-api's e2e-growth target runs on workerd
 * (test/worker/growth/sim.test.ts), Deno and Bun (test/runtime/growth.ts).
 */
export const growthCases: readonly GrowthCase[] = [
  {
    name: 'GET /sim reads tick 0 with four compartments of moles and temperature',
    async run(fetch) {
      const ship = await okJson<ShipSnapshot>('GET /sim', await fetch('/sim'));
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
      }
    },
  },
  {
    name: 'POST /sim/advance of 600 ticks reaches tick 600 at time 300 and 293 K',
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
      const ship = await okJson<ShipSnapshot>('GET /sim', await fetch('/sim'));
      expectEqual('tick', ship.tick, 600);
      // The idle ship has no system yet, so the air holds the deck's 293 K.
      expectEqual(
        'habitat temperature',
        ship.compartments.habitat.temperature,
        293,
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
        (JSON.parse(data.slice('data: '.length)) as ShipSnapshot).tick,
        0,
      );
    },
  },
];
