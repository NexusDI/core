# Simulating the Starship Meridian

Run the library's tests and the doctests in this README with one command. The run passes the library's tests and the two doctests below:

```bash
npx nx test @nexusdi/meridian-systems
```

The library acts as the ship. `examples/bridge-api` serves it over HTTP, while `examples/bridge-console` and `examples/federation-shell` drive it through that API. The library has no server, no UI and no timer: a caller advances it tick by tick.

## Managing Ship State with NexusDI

The Meridian demos require a ship whose state changes between requests, such as a reactor the crew throttles or air in compartments that systems heat, scrub, vent and pump. To maintain clean architecture, a reader opening a demo module should encounter tokens and providers first, and e2e cases must produce identical results on every run.

This library implements the ship as a seeded, fixed-step simulation built from NexusDI modules. It serves as a comprehensive example within the NexusDI repository.

### Defining the Ship

A ship is a root module created by the application. It imports the kernel, the systems and, optionally, the fleet's relay link. Every system module is a plain `defineModule`, except `ShipLifeSupport`, the configured `LifeSupport`. `MeridianSystems` is the aggregate module that imports them all.

`Simulation.forRoot({ seed, dt })` is the kernel, and it binds `TICK_LOOP` and `COMMAND_DESK`. `shipText` from `@nexusdi/meridian-systems/text` gives `explain()` from `@nexusdi/errors` the message and the fix of each `MERIDIAN_*` code.

The doctest below builds a ship from public exports, throttles the reactor to full, advances 16 ticks of half a second and reads the output in MW. A raise of the shields requires 200 MW; because the reactor provides only 193.6 MW at that tick, the router refuses it with `MERIDIAN_POWER_BUDGET`. One tick later, the reactor provides 205.7 MW, and the raise queues for tick 18.

```ts @import.meta.vitest
import { Nexus, defineModule, isNexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import {
  COMMAND_DESK,
  Engineering,
  MeridianSystems,
  REACTOR,
  Simulation,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';
import { shipText } from '@nexusdi/meridian-systems/text';

const Ship = defineModule({
  name: 'Ship',
  imports: [
    Simulation.forRoot({ seed: 7, dt: 0.5 }),
    MeridianSystems,
    Engineering,
  ],
});

await using ship = await Nexus.create(Ship);
const desk = ship.get(COMMAND_DESK);
const loop = ship.get(TICK_LOOP);

desk.submit({ system: 'engineering', action: 'throttle', level: 1 });
loop.advance(16);
Math.round(ship.get(REACTOR).output / 1e5) / 10; // -> 193.6

const raise = () =>
  desk.submit({ system: 'engineering', action: 'shields', raised: true });
let refusal: unknown;
try {
  raise();
} catch (error) {
  refusal = error;
}
isNexusError(refusal, 'MERIDIAN_POWER_BUDGET'); // -> true
if (isNexusError(refusal, 'MERIDIAN_POWER_BUDGET'))
  explain(refusal, { text: [shipText] })?.fix; // -> 'the reactor is at full throttle, so wait for the output to climb.'

loop.advance(1);
Math.round(ship.get(REACTOR).output / 1e5) / 10; // -> 205.7
raise(); // -> { tick: 18 }
```

**Global configuration** is handled by `Simulation.forRoot({ seed, dt })`. This module binds the clock, random source, ship state, deck plan, ship files (`SHIP_FILES`), tick loop (`TICK_LOOP`) and command desk (`COMMAND_DESK`). The `seed` determines the random streams, and `dt` sets the ship seconds per tick. The module validates these with a schema; `Nexus.create` rejects invalid values with `NEXUS_PROVIDER_FAILED` (caused by `NEXUS_INVALID_MODULE_OPTIONS`). `SubspaceLink.forRoot({ relayUrl })` is the second global module, linking the ship to a relay. A root that omits it runs offline.

**System resolution**: `MeridianSystems` imports every system module except `FtlDrive`. Since it provides and exports nothing, a root that needs a system's tokens must import that system's module directly, for example by importing `Engineering` to access `REACTOR` and `POWER_ROUTER`. Because core keys a module by its definition, the `Engineering` module in the root and the one imported by `Weapons` are the same instance.

## Connecting Systems to the Ship

New systems must join the ship without modifying the loop, the router or the command desk. Each system module contributes providers to a `MultiToken`, and the class that collects them reads every contribution with `all()`. The loop and the desk in the kernel read the first two below, the router reads the third, `ShipStateStore` reads the fourth and the master alarm reads the fifth:

- **`SHIP_SYSTEMS`**: Provides an `IShipSystem` with a `name` and a `phase` (1 to 6). `FixedStepLoop` runs these in phase order, then by name. Each system receives its own random stream via `RNG.fork(name)` to ensure adding new systems does not change the random numbers of existing ones.
- **`COMMAND_HANDLERS`**: Provides an `ICommandHandler` that identifies the `system` it serves. `CommandDesk` routes requests based on the `system` field and throws `BadCommandError` for unknown systems.
- **`POWER_CONSUMERS`**: Provides an `IPowerConsumer` whose `draw(ship)` method returns a load. The power router distributes reactor output based on priority.
- **`SHIP_RECORDS`**: Provides a `SystemRecord` containing the system's snapshot slice and setpoints. `ShipStateStore` uses these to build the tick-0 snapshot.
- **`ALARM_SINKS`**: Provides an `IAlarmSink`. The library binds none by default. An application adds one using `provide(ALARM_SINKS, { useClass })`.

A module containing a contribution exports the token, allowing `all()` to find it regardless of the module's position in the graph. If a module keeps its `SHIP_SYSTEMS` provider private, `Nexus.create` rejects it with `NEXUS_UNREAD_CONTRIBUTION`.

To maintain a clean API, every service uses an interface and a token named for its role. For example, `REACTOR` is an `IReactorCore` bound to `FusionReactor` via `useClass`, and consumers list the token in `static deps`. `src/index.ts` exports tokens, interfaces and the seven error classes, while keeping most implementation classes internal.

## NexusDI Feature Demonstrations

This library showcases several NexusDI features across its implementation.

### Breaking cycles with `lazy()`

The shield grid asks the router if its load fits, while the router determines the grid's load via `POWER_CONSUMERS`. To prevent a circular dependency, `PlasmaRouter` takes `lazy(all(POWER_CONSUMERS))` in its `static deps`. The container builds the router with a thunk, then builds the grid. The router executes the thunk only upon the first request for the list. Using plain `all(POWER_CONSUMERS)` would trigger `NEXUS_CIRCULAR_DEPENDENCY`, as verified in `test/engineering.test.ts`.

### Asynchronous startup with `forRootAsync`

`LifeSupport.forRootAsync({ deps: [SHIP_FILES, DECK_PLAN], useFactory: readCalibration })` reads `sensors.calibration.json` through `SHIP_FILES`. The container awaits this factory before building the classes that depend on the options. `Simulation.forRoot` accepts an optional `files` reader; without it, the ship reads copies in `deck/` without I/O. In `bridge-api`, Node servers provide a reader via `node:fs/promises`. `LifeSupport` is configured once in `ShipLifeSupport`, and because `Safety` and `MeridianSystems` import that object, the graph maintains a single `ATMOSPHERE_PROBE`.

### Aliasing with `useExisting`

`Safety` binds `ALARM_BOARD` using `provide(ALARM_BOARD, { useExisting: MASTER_ALARM })`. A consumer requesting only `ALARM_BOARD` receives an `IAlarmBoard` interface with an `active()` method, but cannot access the master alarm's acknowledgment methods. `test/wiring.test-d.ts` uses `@ts-expect-error` to verify that the compiler refuses calls like `board.acknowledge()` on the narrow interface.

### Request-scoped dependencies

`ATMOSPHERE_SENSOR` is transient, meaning every `get()` creates an analyzer that samples its compartment at the current tick. The analyzer depends on `COMPARTMENT`, a scoped factory over `REQUEST`. This allows the compartment associated with the request to be injected without passing arguments to methods. A server opens a scope per request with `ship.createScope({ request: { compartment: 'bridge' } })`, and `Simulation` binds `COMPARTMENT` from that `REQUEST`. If a request lacks a compartment or names one the deck does not have, the first `get` of the sensor throws `UnknownCompartmentError`.

### Lifecycle management on the relay

`SubspaceRelay` uses an async `onInit` to post a handshake to the relay. Because core runs `onInit` after building the graph, a failed handshake causes `Nexus.create` to fail. `PhasedArray` signs off with the relay in `[Symbol.asyncDispose]` while the reactor still provides power. It lists `REACTOR` in its `static deps`, and core disposes a reader before the service it reads, so the reactor scrams after the sign-off. `PhasedArray` requests the link using `optional(SUBSPACE_LINK)`, allowing one `Comms` module to serve both the linked ship and the offline one. `Tactical` binds `NAV_CHARTS` with a factory that either downloads charts over the link or reads the bundled table.

### Dynamic loading with `load()`

`FtlDrive` is a module omitted from `MeridianSystems`. A server can add it to a running container using `load(FtlDrive)`. `load()` rejects a module that exports a contribution to any `MultiToken`, such as `SHIP_SYSTEMS`, with `NEXUS_LOAD_CONTRIBUTION`. `JumpDrive.onInit()` manually registers the drive's record, physics, load and commands, while its dispose method removes them in reverse order.

### Optional peer interceptors

`PressureInterlock` prevents doors from opening when there is more than 5,000 Pa of pressure difference. It is exported via `@nexusdi/meridian-systems/interlock` because it depends on `@nexusdi/interceptors`, an optional peer. Applications register it using `interceptors({ register: [PressureInterlock], bindings: [{ token: BLAST_DOORS, methods: { open: [PressureInterlock] } }] })`.

### Developer tool annotations

`shipNotes(view)` implements the `GraphAnnotator` shape from `@nexusdi/devtools`. It labels providers with `system: <module name>` and assigns `phase: <n>` to `SHIP_SYSTEMS` classes that declare `static readonly phase`. `bridge-api` enables this via `devtools({ annotate: [shipNotes] })`.

## User-Facing Error Handling

The library uses core's `errorBase` to raise seven specific codes: `MERIDIAN_POWER_BUDGET`, `MERIDIAN_BAD_COMMAND`, `MERIDIAN_UNKNOWN_COMPARTMENT`, `MERIDIAN_INTERLOCK`, `MERIDIAN_FTL_NOT_SPOOLED`, `MERIDIAN_RELAY` and `MERIDIAN_UNCHARTED`.

`src/errors.ts` augments `NexusErrorByCode`, so `isNexusError(error, 'MERIDIAN_POWER_BUDGET')` narrows the error to `PowerBudgetError`. `@nexusdi/meridian-systems/text` exports `shipText`, which `explain(error, { text: [shipText] })` from `@nexusdi/errors` uses to return a message and a fix. The doctest above raises the shields at full throttle while the reactor still climbs, and the fix line it gets reads:

```text
The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.
Fix: the reactor is at full throttle, so wait for the output to climb.
```

`MERIDIAN_UNCHARTED` lists known stars, which `bridge-api` maps to a 404 response. `test/contracts/errors.contract.test.ts` checks that each core `NEXUS_*` error a ship build reaches carries the fix line core's text export words, and that `NEXUS_INVALID_MODULE_OPTIONS` and `NEXUS_PROVIDER_FAILED` carry none.

## Testing a Ship

The recommended approach is to build the real ship and swap only the components that interact with external systems. `createTestingContainer` from `@nexusdi/testing` builds the real graph and replaces a specific provider, while `nexusTest` from `@nexusdi/vitest` provides a fresh container for each test. These tests utilize `test/ship-root.ts` and `test/fixtures.ts`.

The doctest below replaces the relay link with a fake, plots a star, throttles the reactor so the array has power to sign off, advances two ticks, and verifies that disposing the ship triggers a sign-off at tick 2.

```ts @import.meta.vitest
import { defineModule } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';
import {
  COMMAND_DESK,
  Engineering,
  MeridianSystems,
  SUBSPACE_LINK,
  Simulation,
  SubspaceLink,
  TICK_LOOP,
  NAV_CHARTS,
  Tactical,
  type ISubspaceLink,
} from '@nexusdi/meridian-systems';

const Ship = defineModule({
  name: 'Ship',
  imports: [
    Simulation.forRoot({ seed: 7, dt: 0.5 }),
    SubspaceLink.forRoot({ relayUrl: 'https://relay.test' }),
    MeridianSystems,
    Engineering,
    Tactical,
  ],
});

const signedOff: number[] = [];
const fakeLink: ISubspaceLink = {
  receive: async <T>() => ({ Vega: 3 }) as T,
  signOff: async (report) => {
    signedOff.push(report.tick);
  },
};

const ship = await createTestingContainer(Ship)
  .override(SUBSPACE_LINK, { useValue: fakeLink })
  .create();

ship.get(NAV_CHARTS).plot('Vega'); // -> { to: 'Vega', heading: 3 }

ship
  .get(COMMAND_DESK)
  .submit({ system: 'engineering', action: 'throttle', level: 1 });
ship.get(TICK_LOOP).advance(2);
await ship[Symbol.asyncDispose]();
signedOff; // -> [2]
```

Run the end-to-end snapshot tests with `npx nx run @nexusdi/meridian-systems:e2e-growth`. Use `-u` after `--` to update the snapshots.

## Next Step

Read [`examples/bridge-api`](../bridge-api/README.md) to see how this simulation is served over HTTP with one scope per request.
