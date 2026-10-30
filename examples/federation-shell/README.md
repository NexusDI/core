# @nexusdi/federation-shell

Run the Meridian shell with its four stations and watch the ship assemble in the browser. The stations and [bridge-api](../bridge-api/README.md) keep running, so use one terminal for each command.

```bash
npx nx dev @nexusdi/bridge-api
npx nx run-many -t serve --projects=@nexusdi/federation-cartography,@nexusdi/federation-command,@nexusdi/federation-engineering,@nexusdi/federation-life-support
```

**The first command** starts bridge-api on port 3000. **The second command** serves the four stations on ports 4301, 4302, 4305 and 4306. Each station's serve target depends on the shell's, so the shell starts on port 4300 too.

Open http://localhost:4300. You see the Meridian heading and a nav bar with Bridge, Cartography, Command, Engineering, Life support and Diagnostics. Each station link loads that station on its route:

- `/charts` shows the star map with "Kepler-442b: heading 42"
- `/command` shows the command deck with its helm buttons
- `/engineering` shows the reactor and coolant gauges
- `/life-support` shows the compartment air

**The engineering and life-support panels** read the live telemetry stream of bridge-api. Stop bridge-api and they show "Telemetry offline". **Diagnostics** lists the modules of the ship's graph, naming each station after you visit it.

**The shell** finds bridge-api through `public/bridge.json`, which holds `{ "url": "http://localhost:3000/" }`. Edit that file to point the shell at another bridge-api. In development, bridge-api's Hono entry answers the shell's origins, `http://localhost:4300` and `http://127.0.0.1:4300`, with CORS headers. The `BRIDGE_API_URL` variable only exists for the end-to-end (e2e) servers, which answer `/bridge.json` with it.

## Distributed Development in a Single Container

In a large project, different teams often build separate modules (like the ship's stations) and need to build, deploy, and fail independently. However, the application still requires a single container where these modules meet.

Each station bundles its own copy of the contract's tokens. The challenge is ensuring that a remote station receives the shell's services using the correct tokens and fails gracefully if the station was built against a newer contract than the shell provides.

## Implementing Runtime Federation

The shell solves this by owning a versioned contract, `meridian` in `@nexusdi/federation-contracts`, while each station acts as a remote that loads into the shell's container at runtime.

**The contract** is `meridian` (version 2.4.0) from `@nexusdi/federation-contracts`. It defines `NAV_CHARTS`, `STATION_TELEMETRY`, and `COMMAND_LINK`. The shell's Tactical module provides and exports these tokens without polluting the globals. Each station accesses Tactical only through a grant: its section loads with `{ imports: [Tactical] }`.

**The shell's container** is `ship`. `createShip()` in `src/ship/ship.ts` builds it with `federation()` from `@nexusdi/federation`. `federation()` binds a remote's copy of a contract token to the shell's copy using a key and name (e.g., `meridian/NavCharts`) and verifies that the shell's version satisfies the one the remote was built against.

**The build configuration** uses specialized helpers from `@nexusdi/federation-contracts/rspack`. Each remote's rspack config uses `meridianRemote()`, while the shell uses `meridianShell()`. Each config passes its own port, and both helpers take the shared packages from `meridianShared()` in `federation-contracts`.

**The discovery process** happens at startup when the shell fetches `/remotes.json` (a list of `{ name, entry }`) and registers them with the Module Federation runtime. The shell build generates this file from the station table in `src/stations.ts`, which defines each station's route, remote name, port, module, and panel. `stationAt(path)` finds a row.

**The loading mechanism** uses `lazySection()` from `@nexusdi/react` to load each station as a lazy section when its route opens. A `SectionBoundary` renders `SectionFailed` if the load fails. `SectionFailed` shows the code of the `SectionError` the boundary hands it, `NEXUS_REACT_SECTION_FAILED`, then the code and message of the load error in its `cause`, which it reads with `isNexusError`. Its Retry button attempts the load again.

**The data flow** is handled via tokens:

- `STATION_TELEMETRY` reads the `GET /telemetry` stream from bridge-api using an `EventSource`.
- `COMMAND_LINK` sends data to `POST /commands`.

`BridgeTelemetry` and `BridgeCommandLink` read the address from `/bridge.json` on first use, so one build talks to whichever bridge-api the server names. The stream does not reconnect; a panel shows "Telemetry offline" until the user leaves the route and returns.

## Verifying Federation Failures

The cartography station includes two extra builds served by the e2e suite to demonstrate how the shell handles federation errors.

- **Contract Drift:** The drift build uses contract version 2.5.0. Because the shell provides 2.4.0, `load()` fails with `NEXUS_CONTRACT_VERSION`. `SectionFailed` displays this code as the cause and a message stating `meridian/NavCharts` is needed at 2.5.0 but the provider has 2.4.0.
- **Missing Shared Dependencies:** The unshared build excludes `@nexusdi/core` from shared packages. This results in the module using a separate copy of core, causing `load()` to fail with `NEXUS_CORE_NOT_SHARED`. The message instructs the developer to share `@nexusdi/core` with `singleton: true`.

## Testing the Ship

The shell's tests operate without a server. The following example creates the ship container and plots a course through the ship's `NAV_CHARTS`:

```ts @import.meta.vitest
import {
  MERIDIAN_CONTRACT_VERSION,
  NAV_CHARTS,
} from '@nexusdi/federation-contracts';

import { createShip } from './src/ship/ship';
import { stationAt } from './src/stations';

await using ship = await createShip();
ship.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
NAV_CHARTS.description; // -> 'meridian/NavCharts'
MERIDIAN_CONTRACT_VERSION; // -> '2.4.0'
stationAt('/command')?.remote; // -> 'federation_command'
```

Run the unit tests and the e2e tests with these commands. The e2e run builds the shell and every remote before driving them in Chromium.

```bash
npx nx test @nexusdi/federation-shell
npx nx e2e @nexusdi/federation-shell
```

## Next Steps

Explore the individual station implementations or the contract definitions:

- [Cartography](../federation-cartography/README.md)
- [Command](../federation-command/README.md)
- [Engineering](../federation-engineering/README.md)
- [Life Support](../federation-life-support/README.md)
- [Federation Contracts](../federation-contracts/README.md)
