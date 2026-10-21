# Bridge console

The Meridian bridge console: a React Router 8 app in framework mode, rendered
on the server. Its server graph `BridgeConsole` imports `BridgeLink`, which
calls the bridge API (`examples/bridge-api`) over HTTP, and its client graph
`BridgeClient` runs in the browser.

The console's loaders call the bridge API at `BRIDGE_API_URL`, which
defaults to `http://127.0.0.1:4211/`. The backend runs on the built
libraries, and the console's build target builds them first:

```sh
npx nx run @nexusdi/bridge-console:build
(cd examples/bridge-api && PORT=4211 node --import tsx src/server.hono.ts) &
npx nx run @nexusdi/bridge-console:dev
```

## The Ship Pages

The pages about the running ship sit in the ship layout,
`app/routes/ship-layout.tsx`, inside the root layout. Its loader reads the
ship once through `BRIDGE_LINK.snapshot()` (`GET /sim` on the backend), or
null when the backend fails, and `shouldRevalidate` returns false, so a
navigation never reloads it.

- `StatusStrip` renders the tick, the ship time, and the habitat's
  temperature and pressure in kPa from the loader's `ShipReading`, or
  `Telemetry offline` for null. After hydration it subscribes through
  `useService(TELEMETRY_CLIENT)` and follows each frame. It shows
  `Telemetry offline` when the stream ends or fails, and unsubscribes on
  unmount.
- `TELEMETRY_CLIENT` (`app/bridge/telemetry-client.ts`) binds
  `EventSourceTelemetry`, which opens an `EventSource` on `/telemetry` in
  `subscribe` only and closes it on an `offline` event or an error, with no
  reconnect. Both `BridgeConsole` and `BridgeClient` import its module,
  `TelemetryClient`, since the server render resolves `useService` from the
  server graph.
- `/telemetry` (`app/routes/telemetry.ts`) is a resource route outside the
  layouts. It relays the body of the backend's `GET /telemetry` with
  `cache-control: no-cache, no-transform`, since react-router-serve's
  compression buffers a response it may transform. A backend that fails
  gives 503.
- `/diagnostics` (`app/routes/diagnostics.tsx`) reads the backend's
  annotated graph through `BRIDGE_LINK.graph()` (`GET /graph`). It lists
  each module with the providers it owns and prints each provider's notes,
  such as `system: Telemetry`. A backend that serves no graph gives
  `Diagnostics are off on this bridge`, and a backend that fails gives
  `The bridge is unreachable` under the status strip.

The console imports `@nexusdi/meridian-systems` and `@nexusdi/devtools` with
`import type` only. A case in `e2e/fresh-server.spec.ts` checks that no
script of the client build holds a description of the simulation's tokens,
such as `TickLoop` or `TelemetryFeed`.

## The Engineering Page

`/systems/engineering` sits in the ship layout, under the status strip, and
sends crew commands to the ship. Its action reads `BRIDGE_LINK` with
`di.inject`, and `BRIDGE_LINK.command(cmd)` posts the command to
bridge-api's `POST /commands`. The page holds a throttle form and a shields
form, and shows the answer to the last command: the tick that applies it, or
the refusal's message and its `Fix:` line. The gauges wait for the telemetry
increment (G0b), so the page reads no ship state.

`command(cmd)` resolves a 202 to `{ accepted: true, tick }` and a 400 or a
409 to `{ accepted: false, status, code, message, fix? }`, and rejects any
other status. The console imports `ShipCommand` from
`@nexusdi/meridian-systems` with `import type`, so no simulation code reaches
its bundle. `tests/routes/engineering.spec.tsx` runs the page on `nexusTest`
with `fakeBridgeLink`, whose idle reactor refuses a shields raise and queues
any other command for tick 1.

## Testing the Console

`npx nx run @nexusdi/bridge-console:e2e` starts both servers itself and
runs the Playwright suite in Chromium, on ports 4210 and 4211. The suite
ignores `e2e/growth/`, so the gating run opens no telemetry stream.

`npx nx run @nexusdi/bridge-console:e2e-growth` builds the console, starts
both servers on ports 4220 and 4221, and runs `e2e/growth/` with
`playwright.e2e-growth.config.mts`. The first case starts from the ship's
current tick, since the backend keeps its ship across retries. It reads that
tick from the backend, opens `/diagnostics` and finds the tick in the strip.
It posts 600 ticks to the backend's `/sim/advance` and reads a tick 600
higher, its ship time, 293 K and 101.3 kPa from the live stream with no
reload. The second case finds `Simulation`, `MeridianSystems` and
`Telemetry` on `/diagnostics`, with `system: Telemetry` on the feed. The
third, `e2e/growth/engineering.spec.ts`, reads the ship's tick from the
backend, raises the shields at the idle reactor and reads the
`MERIDIAN_POWER_BUDGET` text, then sets the throttle and reads
`Queued for tick` with the next tick. Only the non-required `demo-growth` CI
job runs `e2e-growth` (ship systems spec, section 14).

Next, read [the command desk](../meridian-systems/README.md#the-command-desk) for how
the ship hands these commands to Engineering.
