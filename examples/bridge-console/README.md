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
(cd examples/bridge-api && PORT=4211 node --import tsx src/entries/server.hono.ts) &
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

The console imports `@nexusdi/devtools` and the main entry of
`@nexusdi/meridian-systems` with `import type` only. `Tactical` and the helm
page import the star charts from `@nexusdi/meridian-systems/charts`, which
holds no simulation code. A case in `e2e/fresh-server.spec.ts` checks that no
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
its bundle. The console's `Tactical` and the helm page import the star charts
from `@nexusdi/meridian-systems/charts`, which holds the chart table and no
simulation code. `tests/routes/engineering.spec.tsx` runs the page on
`nexusTest` with `fakeBridgeLink`, whose idle reactor refuses a shields raise
and queues any other command for tick 1.

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

## The Comms Page

`/systems/comms` sits in the ship layout beside the other system pages, and the
root layout's nav links it as `Comms`, after `Safety`. The page shows the
phased array and the messages it received. Its loader reads the snapshot alone
through `snapshotLoader`, since the snapshot holds every comms field the page
shows. A failed snapshot shows `Ship snapshot offline` in place of the
gauges and the messages, and the button stays.

- Comms lists four gauges. `Status` is the array's status: `standby`,
  `no subspace link`, `no power` or `awaiting reply`. `Hail queued` is `Yes` or
  `No`. `Last hail sent` is `tick N`, or `none` before the first send.
  `Array power` is the allocated power of the `comms` load in MW to 0.1,
  through `megawatts()` and `fixed()`, so it reads `5.0 MW` on the tick the array
  sends and `0.0 MW` on every other tick.
- Messages lists each message as `<from>: <text> (tick N)`, such as
  `fleet traffic control: sector clear (tick 5)`, or `No messages`. The list
  is `ItemList({ label, none, items })` in `system-page.tsx`, which the safety
  page's alarms use too.

One button, `Hail fleet traffic control`, posts `command=hail` through
`systemAction('comms', {})` and `BRIDGE_LINK.command(cmd)`. The page shows the
answer as the other pages do: `Queued for tick N`. A hail queues even when the
array cannot send it. On a bridge-api with no relay, the status reads
`no subspace link` and the flag stays `Yes`.
`tests/routes/comms.spec.tsx` runs the page on `nexusTest` with
`fakeBridgeLink`. It reads the gauges at tick 0, on the tick the array sends,
while it waits for the reply, after a hail the router shed, on the tick of the
reply and on a ship with no link. It also reads the message list and the three
headings. Its last two cases read the offline snapshot and post a hail that
queues for tick 1.

## The Helm Page

`/systems/helm` sits in the ship layout beside the other system pages, and the
root layout's nav links it as `Helm`, after `Comms`. The page shows the helm
and the main drive and posts the crew's helm commands. Its loader reads the
snapshot alone through `snapshotLoader`, since the snapshot holds the helm
and drive records and the loads. The snapshot carries eight significant
digits, and each gauge rounds that reading once to its own decimals, so
2.0652 m/s reads `2.07 m/s`. A failed snapshot hides the gauges and shows
`Ship snapshot offline`, and the forms stay.

- Helm lists five gauges. `Heading` is the ship's attitude and `Course` the
  helm's setpoint, both in degrees to 0.1 from 0 to 360 through `bearing()`,
  so Kepler-442b reads `42.0°`. The snapshot keeps both in radians.
  `Turn rate` is the rate in °/s to two decimals through `turnRate()`, which
  never prints `-0.00`. `Thruster torque` is in whole N·m, and
  `Thruster power` is the allocated power of the `thrusters` load in MW to 0.1.
- Main drive lists seven gauges: `Burn level` to two decimals, `Drive power` in
  MW to 0.1 from the `main-drive` load, `Thrust` in whole N, `Propellant flow`
  in kg/s to three decimals, `Acceleration` in m/s² to four decimals,
  `Velocity` in m/s to two decimals and `Distance` in whole m. Velocity and
  distance read along the ship's track since tick 0.

Two forms post helm commands through `systemAction('helm', ...)` and
`BRIDGE_LINK.command(cmd)`. The course form holds a select of the stars in
`BUNDLED_CHARTS` and the button `Plot course`, and posts `command=course`
with the star as `to`. The burn form is `LevelForm` (`system-page.tsx`), a
number field from 0 to 1 with the button `Burn`, and posts `command=burn`
with the level. The engineering page's throttle form is a `LevelForm` too.
The page shows the answer to the last command as the other pages do:
`Queued for tick N`, or a refusal with its `Fix:` line.

A turn needs power. The thrusters ask for 20 MW at full torque, and the
router sheds them while the reactor gives less, so a crew that plots a
charted course at the throttle of 0.01 reads `Turn rate` and `Heading`
unchanged until the reactor's level is above 0.0165. The burn waits for 600 MW
the same way.
`tests/routes/helm.spec.tsx` runs the page on `nexusTest` with
`fakeBridgeLink`, fed seed 7's readings of the helm scenario rounded to four
significant digits, as the golden holds them. `/sim` sends eight. It reads the
gauges at tick 0, on the tick the router sheds both loads, on the first tick of
the turn, during a burn off the course axis, on a burn along the course and
after a course to TRAPPIST-1e. It also reads a rate a hair below zero and the
four section headings. When the snapshot fails, the page reads
`Ship snapshot offline` and keeps its controls. It posts a course and a burn,
and shows a refused burn with its `Fix:` line.

## The FTL Page

`/systems/ftl` sits in the ship layout beside the other system pages, and the
root layout's nav links it as `FTL`, after `Helm`. The page shows the jump
drive and posts the crew's spool and jump. Its loader reads the snapshot alone
through `snapshotLoader`, since the snapshot holds the FTL record and its
setpoints beside the loads. Each gauge rounds the snapshot's eight-digit
reading, so 0.45 GJ reads `0.5 GJ` and 8.55 GJ reads `8.6 GJ`. A failed
snapshot hides the gauges and shows `Ship snapshot offline`, and the forms stay.

The FTL drive section lists six gauges:

- `Status` is the record's status. It reads `offline` until the backend has
  loaded the drive and the drive has taken its first step, then `idle`,
  `held`, `spooling` or `charged`.
- `Armed` reads `Yes` or `No` from the setpoint.
- `Spool charge` is the charge in GJ to 0.1, and `Spool power` is the
  allocated power of the `ftl-spool` load in MW to 0.1. It reads `0.0 MW`
  before the drive loads, since the load is not on the router yet.
- `Sector` is the star the ship sits at, `Sol` before the first jump.
  `Last jump` reads `tick N`, or `none` before the first jump. Words and ticks
  carry no unit.

Two forms post the FTL commands. The spool form is the button `Spool drive`,
which posts `command=spool`. The jump form is `StarSelect`
(`star-select.tsx`), a select of the stars in `BUNDLED_CHARTS` and the button
`Jump`, which posts `command=jump` with the star as `to`. The helm page's
course form is a `StarSelect` too. `ftlAction()` in `system-action.server.ts`
reads `command` and `to` and calls `BRIDGE_LINK.spool()` or
`BRIDGE_LINK.jump(to)`. Any other command goes to `command()` for the system
`ftl`, and the page shows the backend's refusal. The two posts go to
`POST /ftl/spool` and `POST /ftl/jump`, outside `POST /commands`. They share
the link's private `#post` with `command()`, so the reading of the 202, 400
and 409 answers exists once. The page shows the answer to the last command as
the other pages do: `Queued for tick N`, or a refusal with its `Fix:` line.

A spool needs power. It asks for 900 MW at priority 7. On a reactor at full
output a main drive that burns at level 1 leaves 384.9 MW. The spool never fits
beside the burning drive, and it charges only with the reactor at level 0.9 or
more, so a crew cuts the burn first. The router refuses a spool on a cold
reactor with the `MERIDIAN_POWER_BUDGET` text: at tick 0 it has 0 MW free. A jump below the full 90 GJ shows
`The FTL drive holds N GJ of the 90 GJ a jump needs.` with its `Fix:` line.
`tests/routes/ftl.spec.tsx` runs the page on `nexusTest` with
`fakeBridgeLink`, fed seed 7's readings of the FTL scenario rounded to four
significant digits, as the golden holds them. `/sim` sends eight. It reads the
gauges at tick 0, on the first tick of the spool, on the tick the router sheds
it, at the full charge and on the tick after the jump, and it reads the gauge
names and the three section headings. When the snapshot fails, the page reads
`Ship snapshot offline` and keeps its controls. The spool button posts and
shows the tick it queues for, and a refused spool shows its `Fix:` line. The
select lists the charted stars, and `Jump` posts the star. A refused jump shows
its text. A command that is neither the spool nor the jump reaches
`command()` for `ftl`. `tests/bridge-link.test.ts` covers both posts: the
spool with no body, the jump with its star, the 409 for a jump below the full
charge and a rejection for a 500.

## The Weapons Page

`/systems/weapons` sits in the ship layout beside the other system pages, and
the root layout's nav links it as `Weapons`, after `FTL`. The page shows the
railgun and posts the crew's shots. Its loader reads the snapshot alone
through `snapshotLoader`, since the snapshot holds the weapons record, its
setpoints and the `railgun` load. A failed snapshot hides the gauges and shows
`Ship snapshot offline`, and the form stays.

The Railgun section lists eight gauges, all in SI units:

- `Status` is the record's status: `idle`, `held`, `charging` or `charged`.
  `Armed` reads `Yes` or `No` from the setpoint.
- `Capacitor charge` is the charge in MJ to 0.1, and `Capacitor power` is the
  allocated power of the `railgun` load in MW to 0.1. The power reads 0.0 MW
  when the bank is full or the router has shed the load.
- `Shot waiting` is the range of the shot that waits for its charge, in whole
  m, or `none`. A shot at 0 m reads `0 m`.
- `Shots fired` and `Hits` are whole numbers. `Last shot` reads
  `hit at 10,000 m, tick 32`, or `none` before the first shot. Words and ticks
  carry no unit.

The Fire section holds one form, `NumberForm` (`system-page.tsx`): a number
field `Range (m)` from 0 to 100,000 in steps of 1, which starts at 10,000, and
the button `Fire`. The form posts `command=fire` with the range, and
`systemAction('weapons', { range: 'number' })` calls `BRIDGE_LINK.command()`
for the system `weapons`. The page shows the answer to the last command as the
other pages do: `Queued for tick N`, or a refusal with its `Fix:` line.
`LevelForm` is a `NumberForm` named `level`, from 0 to 1 in steps of 0.01, so
every number field of the console pages renders one form.

The first fire arms the mount, so it needs the capacitor's 300 MW at priority 6.
On a cold reactor the router refuses it with "The railgun load needs 300 MW, and
the router has 0 MW free beside the loads above it." and the `Fix:` line. Once
the mount is armed, a fire never refuses for power, and it replaces the range of
a shot that still waits. `tests/routes/weapons.spec.tsx` runs the page on
`nexusTest` with `fakeBridgeLink`, fed readings in the shape of seed 7's weapons
scenario rounded to four significant digits, as the golden holds them. `/sim`
sends eight. It reads the gauges at tick 0, with a shot waiting at tick 31,
after the hit at tick 32, at the full capacitor at tick 35, a tick later with
the load at 0 W, after the miss at tick 37 and with the router shedding the load
at tick 62. It reads the gauge names and the two section headings. When the
snapshot fails, the page reads `Ship snapshot offline` and keeps its form. The
range field is bounded and starts at 10,000, and `Fire` posts that range or the
one the reader typed. A refused fire shows its text and its `Fix:` line.

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
`chromium` project ignores the life-support, safety, airlock, helm, ftl,
weapons and comms cases. Those seven cases share their helpers in
`e2e/growth/ship.ts`.

`e2e/growth/helm.spec.ts` runs in a fifth project, `helm`, that depends on
`airlock`. The shared ship holds a throttle of 0.01 with life support online,
and a turn needs the reactor above 0.0165, so the case raises the throttle to
0.6 on `/systems/engineering` first and reads `Queued for tick` with the next
tick. It posts 10 ticks to the backend. On `/systems/helm` the gauges then
read `Heading 0.0°`, `Course 0.0°` and `Thrust 0 N`. The case selects
Kepler-442b and clicks `Plot course`. The page reads `Queued for tick` 10
ticks after the throttle's. After 800 more ticks and a reload, `Heading` and
`Course` read `42.0°`, `Turn rate` `0.00 °/s`, `Thruster torque` `0 N·m` and
`Thruster power` `0.0 MW`. The helm has settled by then on any start tick, so
the burn that follows starts on the course. `Burn` at level 1 reads
`Queued for tick` 810 ticks after the throttle's, and after 400 ticks and a
reload the drive gauges read `Thrust 14,400 N`, `Propellant flow 0.288 kg/s`,
`Acceleration 0.0036 m/s²`, `Velocity 0.72 m/s`, `Distance 72 m` and
`Drive power 600.0 MW`. The case ends with `No alarms` on `/systems/safety`
and no console error. It leaves the drive thrusting on the shared ship, and
the ftl case after it cuts the burn.

`e2e/growth/ftl.spec.ts` runs in a sixth project, `ftl`, that depends on
`helm`. The shared ship holds a throttle of 0.6 and a burning drive, and the
spool fits only beside a reactor at level 0.9 with the drive cut. The case
reads the ship's tick `t` from the backend, sets the throttle to 1 on
`/systems/engineering` and the burn to 0 on `/systems/helm`, and each reads
`Queued for tick` `t + 1`. It posts 40 ticks to the backend. The level climbs
from 0.6 to 0.9 in 30 ticks, so the spool draws from tick `t + 41` on any
start tick. On `/systems/ftl` the gauges read `offline`, `0.0 GJ` and `Sol`,
since no earlier case loads the drive. `Spool drive` reads `Queued for tick`
`t + 41`. After 200 more ticks and a reload, the page reads `charged` and
`90.0 GJ`. The case selects Proxima-b and clicks `Jump`, which reads
`Queued for tick` `t + 241`. After 1 tick and a reload the gauges read
`idle`, `0.0 GJ`, `Proxima-b` and `tick t + 241`. The case ends with
`No alarms` on `/systems/safety` and no console error. The backend is a Node
server with `nodeScopes()`, so the first spool runs the adapter's section and
its extend. The spool does not touch the array, so the comms case, two
projects later, still reads 0 W.

`e2e/growth/weapons.spec.ts` runs in a seventh project, `weapons`, that depends
on `ftl`. The ftl case before it leaves the shared ship at a throttle of 1, the
burn at 0 and the drive disarmed, so the capacitor charges at once. The case
reads the ship's tick `t` from the backend. On `/systems/weapons` the gauges
read `idle`, `No` and `0.0 MJ`. `Fire` reads `Queued for tick` `t + 1`. After 1
tick and a reload the gauges read `charging`, `150.0 MJ`, `300.0 MW` and the
shot waiting at `10,000 m`. After 1 more tick and a reload, `Shots fired` and
`Hits` read `1` and `Last shot` reads `hit at 10,000 m, tick t + 2`. After 4
more ticks and a reload the page reads `charged`, `400.0 MJ` and `0.0 MW`. The
case ends with `No alarms` on `/systems/safety` and no console error. The shot's
pulse heats the coolant by 0.09 K, and Safety raises nothing for it. The first
shot draws the hit on any start tick, since the weapons stream is seeded and no
earlier case fires. The capacitor ends full and asks 0 W, so the comms case after
it still reads 0 W.

`e2e/growth/comms.spec.ts` runs in an eighth project, `comms`, that depends on
`weapons`. The backend's ship has no subspace link, so the hail stays queued
for good, and the case runs after every other case. It reads the ship's tick
from the backend and opens `/systems/comms`, where the status reads `standby`
and the hail flag `No`. The case clicks `Hail fleet traffic control` and reads
`Queued for tick` with the next tick. It posts 10 ticks to the backend and
reloads. The page then reads `no subspace link`, `Yes`, `none` and `0.0 MW`,
and `No messages`, with no console error.

Only the non-required `demo-growth` CI job runs `e2e-growth` (ship systems
spec, section 14).

Next, read [the command desk](../meridian-systems/README.md#the-command-desk)
for how the ship hands these commands to each ship system.
