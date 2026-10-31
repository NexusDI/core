# Engineering Station Demo

To see a remote station read a service the shell provides, run the engineering station demo. This setup demonstrates a remote module consuming a telemetry stream provided by the shell.

## Running the Demo

The demo requires two components to be active: the engineering station and bridge-api, which streams the reactor readings. Since these processes run continuously, use a separate terminal for each command.

```bash
npx nx dev @nexusdi/bridge-api
npx nx serve @nexusdi/federation-engineering
```

The station's serve target starts the shell too.

**Accessing the Interface.** The shell serves on http://localhost:4300 and the station on port 4305. Open http://localhost:4300/engineering to view the Engineering panel. You see the latest reading tick and gauges for Reactor level, Electric output, Coolant, Power allocated, and Loads shed.

**Testing Connectivity.** Stop the `bridge-api` process to verify the failure state; the panel displays "Telemetry offline". The other three routes show "The section failed to load" until you serve their stations too (see the [shell](../federation-shell/README.md)).

## Architecture of the Station

The station demonstrates how to bind local services to shared federated contracts.

**Module Structure.** The station exposes `./section` containing the `EngineeringStation` module and the `EngineeringPanel` component.

**Dependency Binding.** The `EngineeringStation` module binds the `ENGINE_ROOM` token to the `EngineRoom` class. The `EngineRoom` reads this bundle's copy of the contract's `STATION_TELEMETRY` token. `federation()` binds that copy to the shell's by the key `meridian/StationTelemetry`, so the station reads the shell's telemetry service.

**Deployment.** The remote does not host its own page. It provides only `remoteEntry.js` and the chunks for `./section`, which the shell loads at the `/engineering` route.

## Testing the Station

You can verify the station's logic by loading the module into a fake shell and passing one telemetry reading to `gauges()`. `STATION_IMPORTS` imports the fake Tactical, as the shell imports its own.

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';
import {
  FakeShell,
  STATION_IMPORTS,
} from '@nexusdi/federation-contracts/testing';

import {
  ENGINE_ROOM,
  EngineeringStation,
} from './src/engineering-station.module';

const reading = {
  tick: 40,
  reactor: { level: 0.75, electric: 1_234_567_890 },
  coolant: { temperature: 612.34 },
  power: {
    loads: [{ id: 'shields', allocated: 2_250_000 }],
    shed: ['railgun'],
  },
  compartments: {},
};

await using ship = await Nexus.create(FakeShell);
await ship.load(EngineeringStation, STATION_IMPORTS);
ship.get(ENGINE_ROOM).gauges({ status: 'online', reading })?.[1]; // -> ['Electric output', '1,234.6 MW']
```

Execute the test with the following command:

```bash
npx nx test @nexusdi/federation-engineering
```

Next: Explore the [life-support station](../federation-life-support/README.md).
