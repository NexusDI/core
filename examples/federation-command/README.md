# Commanding the Ship

When managing a ship, the bridge needs a way to communicate intent to the helm and engineering systems without knowing how those systems are implemented. This requires a decoupled interface where the command deck sends high-level orders and reads the ship's telemetry.

The `@nexusdi/federation-command` package is the command deck. It loads into the Meridian shell and sends helm and reactor orders to bridge-api over the shell's `COMMAND_LINK`.

To run the demo, you need two separate terminals to keep the API and the station running simultaneously. The station's serve target starts the shell too.

```bash
npx nx dev @nexusdi/bridge-api
npx nx serve @nexusdi/federation-command
```

**Accessing the Interface.** The shell serves on http://localhost:4300 and the station on port 4302. Navigate to http://localhost:4300/command to access the Command deck. The other three routes show "The section failed to load" until you serve their stations too (see the [shell](../federation-shell/README.md)).

**Interacting with the Ship.** Once the deck is loaded, it shows the course and offers these orders:

- **Plotting Course:** The screen displays "course to Kepler-442b, heading 42".
- **Sending Orders:** Clicking "Steer for Kepler-442b" or "Burn at 0.5" sends helm orders; the status line shows the shell's receipt, such as "Queued for tick 4".
- **Managing Power:** Clicking "Reactor to full throttle" increases reactor output to provide power for the burn.
- **Monitoring Telemetry:** The "Burn served" line displays the power the router serves to the main drive in MW, displays `shed` if the power router dropped the main drive, or `telemetry offline` if the stream is interrupted.

## Architecture of the Command Station

The station is built using `@nexusdi/decorators` to define how dependencies are wired within the federation. It exposes `./section` via the `CommandStation` module and the `CommandPanel` component.

The module binds four station tokens, and their classes read the contract's three:

- **Navigation:** binds `COURSE_PLOTTER` to `CoursePlotter`, which accesses `NAV_CHARTS` using `@Inject(NAV_CHARTS) accessor charts`.
- **Helm Control:** `HELM_ORDERS` binds `HelmOrders`. This class is marked as `@Injectable({ deps: [COMMAND_LINK] })` and transmits `helm course` and `helm burn` commands over the `COMMAND_LINK`.
- **Reactor and Telemetry:** `REACTOR_ORDERS` binds `ReactorOrders`, which sends `engineering throttle` over the `COMMAND_LINK`. Additionally, `BURN_BOARD` binds `BurnBoard`, which monitors `STATION_TELEMETRY` to update the power display.

**Metadata and Compilation.** The shell does not import `@nexusdi/decorators`. The shell's core reads the deps that `@Inject` and `@Injectable` write in this bundle, so the bundle compiles standard decorators with swc. Vitest takes the swc settings from `swc.decorators.ts`, and the rspack build gets the same ones from `meridianRemote({ decorators: true })`. The production minifier renames classes, so `CommandStation` sets `name: 'CommandStation'` to keep its name in `graph(ship)`, the module list the shell's Diagnostics page shows.

## Testing the Station

You can verify the station's logic by loading the module into a fake shell and inspecting the recording link to see which orders were dispatched. `STATION_IMPORTS` imports the fake Tactical, as the shell imports its own.

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';
import {
  FakeShell,
  RECORDING_LINK,
  STATION_IMPORTS,
} from '@nexusdi/federation-contracts/testing';

import {
  COURSE_PLOTTER,
  CommandStation,
  HELM_ORDERS,
} from './src/command-station.module';

await using ship = await Nexus.create(FakeShell);
await ship.load(CommandStation, STATION_IMPORTS);
ship.get(COURSE_PLOTTER).course('Kepler-442b'); // -> 'course to Kepler-442b, heading 42'
await ship.get(HELM_ORDERS).burn(0.5);
ship.get(RECORDING_LINK).sent; // -> [{ system: 'helm', action: 'burn', level: 0.5 }]
```

Execute the tests using:

```bash
npx nx test @nexusdi/federation-command
```

Next: explore the [engineering station](../federation-engineering/README.md).
