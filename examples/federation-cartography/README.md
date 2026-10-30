# Visualizing Federation with Cartography

When working with micro-frontends, you need a way to verify that remote modules are loading correctly and sharing the right dependencies. The Cartography station serves as a concrete example of a remote module integrating into the Meridian shell.

To start the cartography station and its associated shell, run:

```bash
npx nx serve @nexusdi/federation-cartography
```

The shell serves on http://localhost:4300 and the station on port 4301. Open http://localhost:4300/charts to see the Star map panel with the line "Kepler-442b: heading 42". The other three routes show "The section failed to load" until you serve their stations too (see the [shell](../federation-shell/README.md)). The station reads no bridge-api data, so it works without it.

## How the Station integrates

The station demonstrates how a remote module exposes its functionality and resolves shared contracts.

**Module Exposure.** The station exposes `./section` using the `CartographyStation` module and the `CartographyPanel` component.

**Contract Binding.** The module binds `NAV_ROUTES` to `SectorRoutes`, which reads this bundle's own copy of the contract's `NAV_CHARTS`. To ensure the shell and remote use the same instance, `federation()` in the shell binds that copy to the shell's via the key `meridian/NavCharts`.

**Dependency Grants.** Because a remote cannot import `Tactical` directly, the shell loads the section with a grant of its `Tactical` module.

## Identifying Federation Failures

The federation system prevents runtime crashes by catching configuration and versioning errors during the loading phase. The station includes two specific builds to demonstrate these safeguards. The shell's e2e suite serves both builds.

**Version Mismatches.** The `build-drift` variant writes to `dist/drift`. Its contracts package uses a version from `drift/version.ts` that is one minor version ahead of the shell's contract. Consequently, the shell's `load()` method fails with `NEXUS_CONTRACT_VERSION`.

**Shared Dependency Conflicts.** The `build-unshared` variant writes to `dist/unshared`. It excludes `@nexusdi/core` from the shared packages list. This causes the module to hold a value made by another copy of `@nexusdi/core`, leading `load()` to fail with `NEXUS_CORE_NOT_SHARED`.

## Testing the Station

You can verify the station's loading logic and grant using a fake shell. `STATION_GRANT` grants the fake Tactical, as the shell grants its own. The following example loads the module and verifies the `NAV_ROUTES` resolution. It also checks `DRIFT_VERSION`, the version the drift build carries.

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';
import {
  FakeShell,
  STATION_GRANT,
} from '@nexusdi/federation-contracts/testing';

import { MERIDIAN_CONTRACT_VERSION as DRIFT_VERSION } from './drift/version';
import {
  CartographyStation,
  NAV_ROUTES,
} from './src/cartography-station.module';

await using ship = await Nexus.create(FakeShell);
await ship.load(CartographyStation, STATION_GRANT);
ship.get(NAV_ROUTES).find('Kepler-442b'); // -> 'Kepler-442b: heading 42'
DRIFT_VERSION; // -> '2.5.0'
```

**Running Tests.** Run the test suite and build the failing variants for analysis with these commands:

```bash
npx nx test @nexusdi/federation-cartography
npx nx build-drift @nexusdi/federation-cartography
npx nx build-unshared @nexusdi/federation-cartography
```

Next: explore the [command station](../federation-command/README.md), which demonstrates implementation using decorators.
