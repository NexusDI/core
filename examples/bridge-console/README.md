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

## Testing the Console

`npx nx run @nexusdi/bridge-console:e2e` starts both servers itself and
runs the Playwright suite in Chromium, on ports 4210 and 4211. The suite
ignores `e2e/growth/`, so the gating run opens no telemetry stream.

`npx nx run @nexusdi/bridge-console:e2e-growth` builds the console, starts
both servers on ports 4220 and 4221, and runs `e2e/growth/` with
`playwright.e2e-growth.config.mts`. One case opens `/diagnostics`, reads tick
0 in the strip, posts 600 ticks to the backend's `/sim/advance`, and reads
tick 600, 300 s, 293 K and 101.3 kPa from the live stream with no reload.
The other finds `Simulation`, `MeridianSystems` and `Telemetry` on
`/diagnostics`, with `system: Telemetry` on the feed. Only the non-required
`demo-growth` CI job runs `e2e-growth` (ship systems spec, section 14).
