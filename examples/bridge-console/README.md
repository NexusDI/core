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
navigation never reloads it. The layout shares that loader with the
engineering and safety pages: `snapshotLoader` in
`app/routes/snapshot-loader.server.ts`. React Router drops each loader from
the client bundle, and the `.server` suffix fails the client build if client
code imports the module.

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

`command(cmd)` resolves a 202 to `{ accepted: true, tick }`, with the
`flightLog` entries when the body carries them, and a 400 or a 409 to
`{ accepted: false, status, code, message, fix? }`, and rejects any other
status. The answer prints one line under `Queued for tick N` per flight-log
entry. The console imports `ShipCommand` from
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
true air. The system pages write their figures through `fixed()` in
`app/bridge/fixed.ts`, which rounds to a fixed number of decimals and groups
the thousands, and their pressures through `kilopascals()` beside it.

The forms post life-support commands through `BRIDGE_LINK.command(cmd)`: one
brings life support online, one sets the habitat heater's target from 283 K
to 303 K, and the airlock's pair sets the pump mode (`off`, `evacuate` or
`fill`) and opens or shuts the vent. The page shows the answer to the last
command, as the engineering page does. Life support runs on the reactor, so
a crew that brings it online at an idle reactor reads its heaters at
0 W until a throttle above 0 gives power. `tests/routes/life-support.spec.tsx`
runs the page on `nexusTest` with `fakeBridgeLink`, fed seed 7's readings at
ticks 0 and 600.

## The Safety Page

`/systems/safety` sits in the ship layout beside the other system pages, and
the root layout's nav links it as `Safety`. The page shows the alarms Safety
raises and the doors and rooms it runs. Its loader reads the snapshot alone
through `snapshotLoader`, since the alarms, the fires, the floods and the door
setpoints all sit in it. A failed snapshot shows `Ship snapshot offline`.

- Alarms lists each active alarm as `<code> in <subject>`, such as
  `FIRE in reactor-bay`, or `No alarms`.
- Doors shows each of the four doors `Open` or `Shut`, with the pressure on
  each side to 0.1 kPa. The outer door's far side reads `Space` at
  0.0 kPa. The console imports only types from the simulation, so the page
  holds its own table of each door's sides, and `satisfies` checks that it
  names every `DoorId`.
- Fire suppression shows each room with a flood charge: the fire intensity
  to two decimals, or `none`, and the flood released in whole mol, beside the
  temperature in whole K.

Two forms post safety commands through `BRIDGE_LINK.command(cmd)`. The door
form holds a select of the four doors and the buttons `Open door` and
`Close door`. The room form lists the rooms with a flood charge and holds
`Flood` and `Drill`. It shows only when the snapshot loaded, since its rooms
come from the snapshot. The page shows the answer to the last command as the
other pages do, and an accepted door command adds its flight-log line, such
as `survey-7: opened bridge-habitat`, under `Queued for tick N`. An open the
interlock refuses shows the `MERIDIAN_INTERLOCK` message and its `Fix:`
line. `tests/routes/safety.spec.tsx` runs the page on `nexusTest` with
`fakeBridgeLink`, fed unrounded floats in the shape seed 7 gives.

## The Airlock Page

`/airlock` sits in the ship layout and the root layout's nav links it as
`Airlock`. The airlock cycle uses the pump and the vent of life support and
the doors of Safety, so the panel sits beside the system pages and outside
`/systems`, which names one ship system per page. Its loader reads the
snapshot alone through `snapshotLoader`, and a failed snapshot shows `Ship snapshot
offline`.

- Airlock lists the `Pump` as `off`, `evacuate` or `fill`, and the `Vent` as
  `Open` or `Shut`.
- Doors shows `habitat-airlock` and `airlock-outer`, each `Open` or `Shut`,
  with the pressure on each side to 0.1 kPa. The outer door's far side reads
  `Space` at 0.0 kPa.

The pump and vent forms are `AirlockControls`, which the life-support page
renders too, and the door form holds a select of the two airlock doors with
`Open door` and `Close door`. The page shows the answer to the last command as
the other pages do, and an open the interlock refuses shows its
`MERIDIAN_INTERLOCK` message and `Fix:` line.

The page posts to two ship systems through one action. `systemAction` takes
one system name or a record that maps each action to its system, and
`AIRLOCK_SYSTEMS` maps `pump` and `vent` to `life-support`, and `open` and
`close` to `safety`. An action outside the record goes to the bridge with an
empty system, and the command desk refuses it with `MERIDIAN_BAD_COMMAND` and
`reason: 'system'`. The safety page shares the door gauges of
`app/routes/systems/doors.tsx` and the door select of `system-page.tsx`, and
the life-support page shares the pump and vent forms of
`app/routes/systems/airlock-controls.tsx`. `tests/routes/airlock.spec.tsx`
runs the page on `nexusTest` with `fakeBridgeLink`, fed unrounded floats in
the shape seed 7 gives.

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
project and runs after every case that reads the idle ship.

`e2e/growth/safety.spec.ts` runs in a third project, `safety`, that depends
on `life-support`. It reads the ship's tick from the backend. It opens
`bridge-habitat` and reads `Queued for tick` with the next tick and
`survey-7: opened bridge-habitat`. The outer door answers the interlock text
with the difference the airlock holds, and the exact `Fix:` line. It closes
`bridge-habitat`, reads `survey-7: closed bridge-habitat`, posts one tick to
the backend and finds the door `Shut`. A drill of the reactor bay reads
`FIRE in reactor-bay` after one tick, and after a flood and 70 ticks the
page reads `No alarms`, with no console error. The flood leaves the bay too
poor in oxygen for a second drill fire, so the case runs once, after every
case that reads the unflooded ship.

`e2e/growth/airlock.spec.ts` runs in a fourth project, `airlock`, that depends
on `safety`, since it needs life support online, and the doors shut and clear
of alarms. It evacuates the airlock on `/airlock` from the ship's current tick
and posts 300 ticks to the backend. The airlock side of the outer door then
reads from 8.5 to 9.5 kPa, and `Open door` answers the interlock text and the
exact `Fix:` line. The case turns the pump off and opens the vent, and after
40 ticks the airlock side reads from 3.5 to 4.5 kPa. `Open door` then reads
`survey-7: opened airlock-outer`, and after 20 more ticks the outer door reads
`Open` with its airlock side at `0.0 kPa`. The case closes the outer door and
starts the fill with the vent shut, and the inner door stays refused. After
114 ticks the two rooms lie 554 Pa apart, so the case turns the pump off and
opens `habitat-airlock`, which reads `survey-7: opened habitat-airlock`. After
20 ticks the inner door reads `Open` with its sides within 0.5 kPa. The case
ends with `No alarms` on `/systems/safety` and no console error. The
`chromium` project ignores the life-support, safety and airlock cases. Those
three cases share their helpers in `e2e/growth/ship.ts`.

Only the non-required `demo-growth` CI job runs `e2e-growth` (ship systems
spec, section 14).

Next, read [the command desk](../meridian-systems/README.md#the-command-desk)
for how the ship hands these commands to each ship system.
