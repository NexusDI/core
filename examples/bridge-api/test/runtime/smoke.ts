import { Nexus } from '@nexusdi/core';

import { cases, type Leg } from '../../e2e/cases';
import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';

// The two runtimes' server APIs, as far as this file calls them.
declare const Deno:
  | {
      serve(
        options: {
          port: number;
          hostname: string;
          onListen(address: { port: number }): void;
        },
        handler: (request: Request) => Response | Promise<Response>,
      ): { shutdown(): Promise<void> };
    }
  | undefined;
declare const Bun:
  | {
      serve(options: {
        port: number;
        hostname: string;
        fetch: (request: Request) => Response | Promise<Response>;
      }): { port: number; stop(force?: boolean): Promise<void> | void };
    }
  | undefined;

type Fetch = (request: Request) => Response | Promise<Response>;

/** Deno.serve(app.fetch) or Bun.serve({ fetch: app.fetch }), on a free port. */
async function serve(fetch: Fetch) {
  if (typeof Deno !== 'undefined') {
    let server: { shutdown(): Promise<void> } | undefined;
    const port = await new Promise<number>((resolve) => {
      server = Deno.serve(
        { port: 0, hostname: '127.0.0.1', onListen: (a) => resolve(a.port) },
        fetch,
      );
    });
    return {
      url: `http://127.0.0.1:${port}`,
      close: async () => server?.shutdown(),
    };
  }
  if (typeof Bun !== 'undefined') {
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch });
    return {
      url: `http://127.0.0.1:${server.port}`,
      close: async () => server.stop(true),
    };
  }
  throw new Error('smoke.ts runs under Deno or Bun');
}

// The bridge API's e2e cases on Deno or Bun, over OfflineMeridian, the
// graph every runtime leg runs (spec 9.8). Each mismatch is printed, and
// any mismatch fails the run.
const failures: string[] = [];
for (const each of cases) {
  const leg: Leg = {
    framework: 'hono',
    start: (ship, scopes) => serve(createBridge(ship, { scopes }).fetch),
    ship: (plugins = []) => Nexus.create(OfflineMeridian, { plugins }),
    check(what, actual, expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        failures.push(
          `${each.name}: ${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
        );
    },
  };
  await each.run(leg);
}
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  failures.length === 0
    ? `PASS bridge-api runtime checks (${cases.length} cases)`
    : `${failures.length} failure(s)`,
);
if (failures.length > 0) throw new Error('runtime checks failed');
