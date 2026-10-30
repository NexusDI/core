# Bridge Console

**Experience the console in action.** Start the bridge API first, then the console:

```bash
npx nx run @nexusdi/bridge-api:dev
```

Both targets run until you stop them, so start the console in a second terminal. Its dev target builds the libraries it uses first.

```bash
npx nx run @nexusdi/bridge-console:dev
```

The bridge console is the browser front end of the Starship Meridian. It is a React Router 8 app in framework mode, rendered on the server, that communicates with the bridge API (`examples/bridge-api`) over HTTP.

**Explore the interface.** The console loaders call the bridge API at `BRIDGE_API_URL` (defaulting to `http://127.0.0.1:3000/`). React Router serves the console on port 5173. Open `http://localhost:5173/` to see the Bridge console page with its navigation bar and the home page course plotter. The ship pages, such as `/systems/engineering`, add a status strip with the tick, the ship time and the habitat air. **Test the resiliency** by stopping the `bridge-api` and reloading an engineering page; the status strip will update to "Telemetry offline".

## The problem

**Decoupling the frontend from the simulation.** A browser front end for a ship needs the ship's state, but the ship runs in a separate process. To prevent the browser bundle from bloating with simulation code and to ensure the UI remains functional when the backend is offline, the console imports simulation types only and keeps container code out of its components.

## The idea

**The solution.** This demo demonstrates how a NexusDI application achieves this by placing services behind tokens, utilizing one container per graph, and implementing a scope per request.

**Separating server and client graphs.** The console uses two module graphs, each with its own container. A graph is a root module and the modules it imports. The server graph `BridgeConsole` (`app/di/bridge.server.ts`) imports `Tactical`, `Watch`, `TelemetryClient`, and `BridgeLink.forRoot({ url })` (`Tactical` binds the star charts, `Watch` binds `WATCH_LOG`). The client graph `BridgeClient` (`app/di/bridge.client.ts`) imports only `Tactical` and `TelemetryClient`, ensuring the browser holds no direct link to the backend. Both are initialized with `Nexus.create` in `app/nexus.server.ts` and `app/ship.client.ts`. To ensure the container is ready before hydration, `entry.client.tsx` awaits the client container and passes it to `NexusProvider`.

**Abstracting dependencies with tokens.** The console's own services are tokens in `app/di/contracts.ts`: `BRIDGE_LINK` (an `IBridgeLink`), `TELEMETRY_CLIENT` (an `ITelemetryClient`), and `WATCH_LOG` (an `IWatchLog`, the console's own record of a request). Pages reference these tokens. To maintain a lean bundle, the console imports `@nexusdi/meridian-systems` using `import type` only, and imports star charts from `@nexusdi/meridian-systems/charts`, which contains no simulation code.

## The link and BRIDGE_OFFLINE

**Managing scoped requests.** `BRIDGE_LINK` is a scoped provider. `BridgeApiLink` takes `REQUEST` in its dependencies to send the request's mission ID in the `x-mission-id` header and passes the request's abort signal. This allows the backend to open a matching scope for the mission and ensures that when a user leaves a page, the backend call is cancelled.

**Handling network failures.** When the network fails, `command` and `loadFtl` return a `BridgeOffline` reply and do not throw. This reply includes `accepted: false`, status 503, code `BRIDGE_OFFLINE`, the target address, and a suggested fix. The message names the address, and the fix names `npx nx run @nexusdi/bridge-api:dev` and `BRIDGE_API_URL`. An abort of the request's signal still rejects, because the reader has left the page. Pages display this reply in the form's answer band. For critical failures, each system route (`/systems/*` and `/airlock`) uses `SystemErrorBoundary`, which renders `SnapshotOffline` ("Ship snapshot offline") when a loader or action throws. The ship snapshot loader answers null when the backend fails, so the page shows the ship offline and keeps its forms.

**Verify offline behavior.** The following doctest points the link to an unused address and attempts a throttle command:

```ts @import.meta.vitest
import { defineModule, Nexus } from '@nexusdi/core';

import { BridgeLink } from './app/di/bridge-link.module';
import { BRIDGE_LINK } from './app/di/contracts';

const Probe = defineModule({
  name: 'Probe',
  imports: [BridgeLink.forRoot({ url: 'http://127.0.0.1:1/' })],
});
await using ship = await Nexus.create(Probe);
await using scope = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});

const answer = await scope
  .get(BRIDGE_LINK)
  .command({ system: 'engineering', action: 'throttle', level: 1 });
answer.accepted; // -> false
'code' in answer && answer.code; // -> 'BRIDGE_OFFLINE'
'status' in answer && answer.status; // -> 503
```

## Pages read the ship from one place

**Centralizing telemetry.** The status strip and each system page read the ship through the `useShipReading(snapshot)` hook (`app/hooks/use-ship-reading.ts`). This hook takes the loader's snapshot, resolves `TELEMETRY_CLIENT` via `useService`, and tracks telemetry frames. To prevent stale revalidations from overwriting newer data, the hook ensures only the highest tick wins. It returns null once the stream goes offline, and it subscribes again when the loader hands over a new snapshot.

**Sharing the EventSource.** `TELEMETRY_CLIENT` binds `EventSourceTelemetry` (`app/di/telemetry-client.module.ts`). All subscribers share a single `EventSource` on `/telemetry`; the first subscription opens the connection, and the last unsubscribe closes it. An `offline` event or an error closes it too, and then every subscriber is told the stream is offline. The `/telemetry` resource route (`app/routes/telemetry.ts`) relays the backend's `GET /telemetry` and returns 503 if the backend fails. Both graphs import the `TelemetryClient` module to ensure the server render can resolve `useService` from the server graph.

**Try it on `/systems/engineering`** to see the status strip follow the ship tick by tick.

## Commands and the answer band

**Processing system actions.** System pages post forms to route actions created by `systemAction` (`app/routes/systems/system-action.server.ts`). This action reads the form as a `ShipCommand` and calls `BRIDGE_LINK.command(cmd)` through `di.inject`, the request-scope handle that `nexus()` from `@nexusdi/react-router` returns in `app/nexus.server.ts`. A 202 status results in `{ accepted: true, tick }`, while 400 or 409 statuses return a refusal with a `code`, `message`, and `fix`. Any other status rejects.

**Tracking command status.** The `useShipCommand` hook (`app/hooks/use-ship-command.ts`) manages the answer band under the form. It first displays "Queued for tick N." Once a telemetry reading reaches that tick, the band adds "Applied at tick N." Refusals and `BridgeOffline` replies are displayed with their respective codes and fixes. Once a band reads applied, it stays applied for that answer.

**Try it on `/systems/engineering`**: attempt to raise shields with an idle reactor to see a power budget refusal, then set a throttle to watch the band move from queued to applied.

## Server-only code

**Preventing client-side leaks.** Loaders and actions that interact with the container are stored in `.server.ts` files (e.g., `nexus.server.ts`, `snapshot-loader.server.ts`, and `system-action.server.ts`). React Router removes these from the client bundle, and the `.server` suffix triggers a build failure if client code attempts to import them.

## Charts and the library's tokens

**Implementing library contracts.** `Tactical` (`app/di/tactical.module.ts`) provides `NAV_CHARTS` from `@nexusdi/meridian-systems/charts` using `provide(NAV_CHARTS, { useClass: ChartTable })`. Since `ChartTable` extends the library's `StarCharts` and performs no I/O, it is included in the browser build. Components like the home page course plotter and helm page star select access this via `useService(NAV_CHARTS)`.

**Try the plotter on `/`**: typing an uncharted star name shows a refusal whose fix lists the charted stars.

The `/charts` page shows the star map as a `lazySection` (`app/routes/charts.tsx`) behind a `SectionBoundary`, so the server HTML carries the fallback and the browser loads the map after hydration.

The `/diagnostics` page lists the backend's graph, and it has a graph to list only when `bridge-api` runs with `SHIP_INTROSPECTION` on. Without it, `bridge-api` answers `GET /graph` with 404, `link.graph()` returns null, and the page reads "Diagnostics are off on this bridge".

## Development checks

**Enforcing DI constraints.** In development, both graphs register the `react()` plugin from `@nexusdi/react` (`bridgeServerPlugins` and `bridgeClientPlugins`), and the server graph adds `errors()` from `@nexusdi/errors`, which words the fix lines. The `react()` plugin prevents transient token reads during render by throwing a `TransientInRenderError` (`NEXUS_REACT_TRANSIENT_IN_RENDER`). These plugins are removed in production builds.

## Components take props

**Maintaining pure components.** Components in `app/components/` receive data exclusively via props. To enforce this, an ESLint rule in `eslint.config.mjs` forbids any `@nexusdi/*` imports in these files, except for `@nexusdi/meridian-ui` and type imports. Hooks and routes read the container, and components take props, a boundary `tests/lint-seam.test.ts` verifies.

## Testing it

**Simulating the environment.** `tests/support/console.tsx` uses `nexusTest` from `@nexusdi/vitest` to build the server graph and provides a `renderRoute` fixture. It also opens a request scope for each call. `renderRoute(route, { path })` simulates the React Router lifecycle, utilizing a client container where `TELEMETRY_CLIENT` is replaced by a `FakeTelemetry` double. Route specs use `fakeBridgeLink` from `tests/doubles.ts` to eliminate network dependencies. A route spec also mocks the server container with `vi.mock('../../app/nexus.server', () => import('../support/nexus-server'))`. `tests/routes/engineering.spec.tsx` is the full example.

**Verify the command band.** The following doctest builds the server graph with the fake link bound, sends a command through the link, and hands the answer to the console's `answerBand` (`app/hooks/use-ship-command.ts`), the function behind `useShipCommand`:

```ts @import.meta.vitest
import { createTestingContainer } from '@nexusdi/testing';

import { BridgeConsole } from './app/di/bridge.server';
import { BRIDGE_LINK } from './app/di/contracts';
import { answerBand } from './app/hooks/use-ship-command';
import { fakeBridgeLink, shipAtStart } from './tests/doubles';

await using ship = await createTestingContainer(BridgeConsole)
  .override(BRIDGE_LINK, fakeBridgeLink)
  .create();
await using scope = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});

const answer = await scope
  .get(BRIDGE_LINK)
  .command({ system: 'engineering', action: 'throttle', level: 1 });
answerBand(answer, shipAtStart).state; // -> 'queued'
answerBand(answer, { ...shipAtStart, tick: 1 }).state; // -> 'applied'
```

**Run all console tests** with `npx nx test @nexusdi/bridge-console`.

## Next

**Scaling with federation.** The federation shell allows the application to load station remotes into a single ship at runtime. Read [its README](../federation-shell/README.md) next.
