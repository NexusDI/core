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
  temperature in whole kelvin and pressure to 0.1 kPa from the loader's
  `ShipReading`, through `fixed()`, or
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
the refusal's message and its `Fix:` line. Its loader reads the ship through
`BRIDGE_LINK.snapshot()` for four gauges: the reactor level, the electric
output, the coolant temperature and the power the shields draw. React Router
reloads them after each command. A backend that fails gives
`Gauges offline`, and the forms stay.

`command(cmd)` resolves a 202 to `{ accepted: true, tick }` and a 400 or a
409 to `{ accepted: false, status, code, message, fix? }`, and rejects any
other status. The console imports `ShipCommand` from
`@nexusdi/meridian-systems` with `import type`, so no simulation code reaches
its bundle. `tests/routes/engineering.spec.tsx` runs the page on `nexusTest`
with `fakeBridgeLink`, whose idle reactor refuses a shields raise and queues
any other command for tick 1.

## The Life-Support Page

`/systems/life-support` sits in the ship layout beside the engineering page
and shows the air of each compartment as its gas analyzer reads it. Its
loader reads `BRIDGE_LINK.snapshot()` and `BRIDGE_LINK.atmosphere(id)` for
the four compartments, all in parallel. `atmosphere(id)` calls
bridge-api's `GET /compartments/:id/atmosphere`, so each read opens a request
scope on the backend whose compartment comes from the path, and a 404
rejects. A read that fails shows `Analyzer offline` for its compartment, and
a failed snapshot shows `Ship snapshot offline`. The rest of the page stays.

Each compartment shows its analyzer's tick, temperature to 0.1 K, pressure to
0.1 kPa, and O₂ and CO₂ partial pressures to 0.01 kPa. The bridge and the
habitat also show their heater power from the snapshot, in whole watts. The
analyzer adds its own noise, so its temperature differs from the snapshot's
true air. Both system pages write their figures through `fixed()` in
`app/bridge/fixed.ts`, which rounds to a fixed number of decimals and groups
the thousands.

The forms post life-support commands through `BRIDGE_LINK.command(cmd)`: one
brings life support online, one sets the habitat heater's target from 283 K
to 303 K, and the airlock's pair sets the pump mode (`off`, `evacuate` or
`fill`) and opens or shuts the vent. The page shows the answer to the last
command, as the engineering page does. Life support runs on the reactor, so
a crew that brings it online at an idle reactor reads its heaters at
0 W until a throttle above 0 gives power. `tests/routes/life-support.spec.tsx`
runs the page on `nexusTest` with `fakeBridgeLink`, fed seed 7's readings at
ticks 0 and 600.

## Testing the Console

`npx nx run @nexusdi/bridge-console:e2e` starts both servers itself and
runs the Playwright suite in Chromium, on ports 4210 and 4211. The suite
ignores `e2e/growth/`, so the gating run opens no telemetry stream.

`npx nx run @nexusdi/bridge-console:e2e-growth` builds the console, starts
both servers on ports 4220 and 4221, and runs `e2e/growth/` with
`playwright.e2e-growth.config.mts`. The cases share the backend's manual
ship, so the config runs them one at a time with no retry, and each reads
the state it needs. The first case starts from the ship's current tick. It
reads that tick from the backend, opens `/diagnostics` and finds the tick in
the strip. It posts 600 ticks to the backend's `/sim/advance` and reads a
tick 600 higher, its ship time, 293 K and 101.3 kPa from the live stream
with no reload. The second case finds `Simulation`, `MeridianSystems` and
`Telemetry` on `/diagnostics`, with `system: Telemetry` on the feed. The
third, `e2e/growth/engineering.spec.ts`, reads the ship's tick from the
backend, raises the shields at the idle reactor and reads the
`MERIDIAN_POWER_BUDGET` text, then sets the throttle and reads
`Queued for tick` with the next tick.

`e2e/growth/life-support.spec.ts` sets the throttle to 0.01 on the engineering
page and brings life support online, and each form answers `Queued for tick`
with the next tick. It posts 600 ticks to the backend, reloads, finds four
analyzers at the new tick, and reads the habitat from 292.5 K to 292.8 K, from
101.0 kPa to 101.2 kPa and a heater from 2,000 W to 5,000 W, with no console
error. Life support has no offline command, so the config runs this case in a
second Playwright project, `life-support`, that depends on the `chromium`
project and runs after every case that reads the idle ship. Only the
non-required `demo-growth` CI job runs `e2e-growth` (ship systems spec,
section 14).

Next, read [the command desk](../meridian-systems/README.md#the-command-desk)
for how the ship hands these commands to Engineering and LifeSupport.
