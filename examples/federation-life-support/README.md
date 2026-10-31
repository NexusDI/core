# Life Support Station Demo

Running a federated module requires a running shell to host it and a backend to provide data. This demo allows you to run a life-support station, connect it to a shell, and verify that commands and telemetry flow across the federation boundary.

To see the system in action, start bridge-api and the station in separate terminals:

```bash
npx nx dev @nexusdi/bridge-api
npx nx serve @nexusdi/federation-life-support
```

The station's serve target starts the shell too.

**Accessing the Demo.** The Meridian shell serves on http://localhost:4300 and the station on port 4306. Navigate to http://localhost:4300/life-support to open the Life Support panel.

The panel displays a real-time tick of the latest reading and the atmospheric data for each compartment, including temperature, pressure, and the partial pressures of O₂ and CO₂. You can send habitat orders with five buttons, such as "Bring life support online" and "Run the habitat scrubber". If you stop the `bridge-api` process, the panel displays "Telemetry offline". The other three routes show "The section failed to load" until you serve their stations too (see the [shell](../federation-shell/README.md)).

## How the Station is Structured

The station provides a federated module that the shell consumes at runtime.

**Module Exposure.** The station exposes the `./section` entry point containing the `LifeSupportStation` module and the `LifeSupportPanel` component.

**Dependency Binding.** To manage air quality, the module binds the `ATMOSPHERE_DESK` token to the `AtmosphereDesk` class. This class depends on two tokens of the meridian contract, `STATION_TELEMETRY` and `COMMAND_LINK`.

**Federation Mapping.** The shell's `federation()` plugin binds both tokens to the shell's copies by their keys, `meridian/StationTelemetry` and `meridian/CommandLink`. The remote serves only `remoteEntry.js` and the `./section` chunks, and the shell routes to the station and loads it at `/life-support`.

## Testing the Station

You can verify the station's logic without a browser by loading the module into a fake shell. This allows you to simulate compartment air readings and track commands sent through a recording link. `STATION_IMPORTS` imports the fake Tactical, as the shell imports its own.

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';
import {
  FakeShell,
  RECORDING_LINK,
  STATION_IMPORTS,
} from '@nexusdi/federation-contracts/testing';

import {
  ATMOSPHERE_DESK,
  LifeSupportStation,
} from './src/life-support-station.module';

const compartments = {
  bridge: { temperature: 293, pressure: 101300, moles: { O2: 524 } },
};
const reading = {
  tick: 0,
  reactor: { level: 0, electric: 0 },
  coolant: { temperature: 500 },
  power: { loads: [], shed: [] },
  compartments,
};

await using ship = await Nexus.create(FakeShell);
await ship.load(LifeSupportStation, STATION_IMPORTS);
const desk = ship.get(ATMOSPHERE_DESK);
desk.compartments({ status: 'online', reading })?.[0]?.gauges[1]; // -> ['Pressure', '101.3 kPa']
await desk.scrubber('bridge', true);
ship.get(RECORDING_LINK).sent; // -> [{ system: 'life-support', action: 'scrubber', compartment: 'bridge', on: true }]
```

Run these tests using:

```bash
npx nx test @nexusdi/federation-life-support
```

**Next Step:** Explore the [federation-contracts](../federation-contracts/README.md) shared across all stations, or review the [shell README](../federation-shell/README.md).
