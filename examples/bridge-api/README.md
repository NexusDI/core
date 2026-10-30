# bridge-api

Try the bridge API by starting the server and requesting a course:

```bash
npx nx run @nexusdi/bridge-api:dev
```

The dev target keeps running, so send the request from a second terminal:

```bash
curl -i localhost:3000/course/Vega
```

**The dev target** starts the local subspace relay (port 3100, or `RELAY_PORT`) and the Hono server on port 3000 (`PORT`) with `RELAY_URL` pointing at the relay and `SHIP_INTROSPECTION=on`.

**The response** for Vega is a 404 because the star is not on the ship's charts. The server returns a body with three fields: `code`, `message`, and `fix`:

```json
{
  "code": "MERIDIAN_UNCHARTED",
  "message": "No star is charted as 'Vega'.",
  "fix": "plot a course to a charted star: Kepler-442b, Proxima-b, TRAPPIST-1e."
}
```

**Error handling** across `/course/:to` and `POST /commands` follows this pattern: any refusal returns that same body, `{ code, message }` plus `fix` when the error's text has one. A bug returns an empty 500, and unmatched paths return an empty 404.

## The Problem

A server team adopting NexusDI needs a way to serve real HTTP routes using a single module graph, with a scope per request, before committing to a specific web framework.

This app acts as the bridge API for the Starship Meridian. The ship's logic resides in `@nexusdi/meridian-systems`, a library with no server implementation. The bridge API provides the HTTP layer for that ship.

## The Solution

**The module graph** is defined in `src/ship`. A private function, `bridgeShip` in `src/ship/meridian.module.ts`, builds two versions: `Meridian` (linked to a relay via `SubspaceLink.forRoot({ relayUrl })`) and `OfflineMeridian` (using bundled star charts).

**Framework independence** is achieved through entry points in `src/entries/`. Whether using `hono.ts`, `express.ts`, or `fastify.ts`, each exports `createBridge(ship, options)` to serve the same routes via `@nexusdi/hono`, `@nexusdi/express`, or `@nexusdi/fastify`. The Hono bridge also runs on Cloudflare Workers (`src/entries/worker.ts`), the Edge Runtime, Deno, and Bun. The `test-edge` target runs the Edge Runtime suite, and the `runtime-leg` target runs the Deno or Bun leg (`--leg=deno|bun`).

**Request scoping** ensures isolation. Each request opens a new scope. The adapter populates the scope's `REQUEST` token using the `x-mission-id` header (defaulting to `survey-7`) and, for `/compartments/:id/...` routes, the specific compartment. `MISSION` and `FLIGHT_LOG` are scoped, so each request gets its own flight log, and each entry carries the request's mission ID.

## The Routes

The API exposes various endpoints for ship management and telemetry: `GET /health`, `GET /graph`, `GET /profile`, `GET /course/:to`, `GET /sim`, `POST /sim/advance`, `GET /alarms`, `GET /audit`, `GET /compartments/:id/atmosphere`, `GET /telemetry`, `GET` and `POST /commands`, and `POST /sections/ftl`.

- **Course Plotting:** `/course/:to` plots a course through `NAV_CHARTS` and records the action in the request's flight log. Uncharted stars return the 404 refusal body.
- **Command Execution:** `POST /commands` sends the body to `COMMAND_DESK`. Bad commands return 400, and other refusals return 409. Accepted commands return 202 with a tick. A hail on a ship without a subspace link returns 202 with a `MERIDIAN_NO_SUBSPACE_LINK` notice; relay faults return `MERIDIAN_RELAY`. Both fixes name `RELAY_URL` and the `dev-relay` target (`npx nx run @nexusdi/bridge-api:dev-relay`) and say that `dev` starts both. Both use `RELAY_FIX` (`src/bridge/relay-text.ts`). `relayText` sits first in `SHIP_TEXT` (`src/bridge/refusal.ts`), so `explain()` returns `RELAY_FIX` for `MERIDIAN_RELAY` ahead of the ship's own fix. `src/bridge/commands.ts` adds it to the notice from `NOTICE_FIX`.
- **Simulation:** `POST /sim/advance` moves a manual ship `n` ticks. If the ship is live, it advances on its own timer and the route returns 404.
- **Dynamic Loading:** `POST /sections/ftl` loads the `FtlDrive` module into the running ship. The request scope is extended via `scope.extend()`, allowing the drive's tokens to resolve within that scope. From then on the command desk serves the `ftl` system on `POST /commands`.
- **Alarm Monitoring:** `GET /alarms` lists active alarms via `ALARM_BOARD` (a narrow token that cannot acknowledge). `AlarmPanel` contributes a sink to `ALARM_SINKS`, which writes every alarm event to the audit log.
- **Logging and Interceptors:** `GET /audit` returns the audit and comms logs. An audit interceptor logs every `NAV_CHARTS` call. A hail log interceptor uses `tap()` to record "hail queued for tick N" without breaking hail synchronicity. A retry interceptor attempts to call `SUBSPACE_LINK.signOff` up to three times (100ms apart) on failure, logging each failed attempt to the comms log. The retry stops early when the 6000 ms deadline would pass before another attempt finishes.

## Interceptors and Plugins

The plugin list in `src/ship/plugins.ts` includes interceptors (audit, flight recorder, pressure interlock, hail log, retry), a phase check, and, in Node entries outside production, the `errors()` plugin with `SHIP_TEXT` packs.

**The black box recorder** (`src/ship/black-box.plugin.ts`) tracks the last 256 trace events, stamping every system with its phase and scope. `introspect()` in `src/bridge/profile.ts` registers it beside `devtools()` and the profiler when `SHIP_INTROSPECTION` is on.

<a id="MERIDIAN_SYSTEM_PHASE"></a>

### MERIDIAN_SYSTEM_PHASE

**The phase check** ensures every `SHIP_SYSTEMS` class declares a `static phase` between 1 and 6. If missing, `Nexus.create` fails with `MERIDIAN_SYSTEM_PHASE` and a fix suggesting the use of `static readonly phase`. The check reads class providers only: a factory or a value contribution has no class to read a static from, so it skips them.

## SHIP_INTROSPECTION

The `SHIP_INTROSPECTION` environment variable controls diagnostic visibility. When enabled, it activates `GET /graph`, `GET /profile` (startup table and critical path), the devtools plugin, and the black box.

- **Default behavior:** If unset or empty, Node entries follow `NODE_ENV` (on outside production), while Worker entries remain off.
- **Validation:** Any value other than `on` or `off` causes startup to throw: `"SHIP_INTROSPECTION is 'x'. Set it to 'on' or 'off', or leave it unset to follow NODE_ENV."`
- **Disabled state:** If off, the diagnostic routes return 404.

**The profile target** runs `nexusdi profile` around a self-started relay:

```bash
npx nx run @nexusdi/bridge-api:profile
```

This executes `nexusdi profile` on `src/ship/relay-meridian.ts#RelayMeridian` and generates `profile.json`.

## Other Environment Variables

The Node servers read two more variables that set up the simulation.

- **SIM_MODE:** `live` or `manual` (defaults to `live`).
- **SIM_SEED:** An integer from 0 to 4294967295 (defaults to 7).

Invalid values for these variables cause a startup failure with a message naming the variable.

## Testing it

Tests start an `OfflineMeridian` with `bridgePlugins()`, hand it to `createBridge`, and call routes with `app.request`, so they need no port or relay. The package exports `./hono` and `./ship`, which the doctest imports.

The following doctest demonstrates the uncharted star scenario. You can run all project tests with `npx nx test @nexusdi/bridge-api`.

```ts @import.meta.vitest
import { createBridge } from '@nexusdi/bridge-api/hono';
import { OfflineMeridian, bridgePlugins } from '@nexusdi/bridge-api/ship';
import { Nexus } from '@nexusdi/core';

await using ship = await Nexus.create(OfflineMeridian, {
  plugins: bridgePlugins(),
});
const app = createBridge(ship);

const refused = await app.request('/course/Vega');
refused.status; // -> 404
const body = await refused.json();
body; // -> { code: 'MERIDIAN_UNCHARTED', message: "No star is charted as 'Vega'.", fix: 'plot a course to a charted star: Kepler-442b, Proxima-b, TRAPPIST-1e.' }
```

## Next

The **[bridge-console](../bridge-console/README.md)** provides a browser-based interface for this API. Read its README next.
