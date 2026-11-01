# @nexusdi/federation-contracts

The `meridian` contract between the Meridian shell (`examples/federation-shell`) and its
four remotes, `federation-cartography`, `federation-command`, `federation-engineering` and
`federation-life-support`. The package is private and part of the federation demo.

`src/index.ts` defines the contract with `defineContract({ key: 'meridian', version })`
at version 2.4.0, and three tokens:

- `NAV_CHARTS = meridian.token<INavCharts>('NavCharts')`, described `meridian/NavCharts`:
  the star charts.
- `STATION_TELEMETRY = meridian.token<IStationTelemetry>('StationTelemetry')`, described
  `meridian/StationTelemetry`: the ship's telemetry, shaped for `useSyncExternalStore`.
- `COMMAND_LINK = meridian.token<ICommandLink>('CommandLink')`, described
  `meridian/CommandLink`: sends a crew command to bridge-api's `POST /commands`.

The package declares its own reading types (`TelemetryReading`, `CompartmentTelemetry`
and `TelemetryState`) and imports nothing from the simulation, so a remote that bundles
the contract bundles no simulation code.

## Who owns the contract

The shell owns it. The shell's `Tactical` module provides every contract token, so the
team that binds the providers decides what each token promises and when the version
moves. The remotes depend on this package and never provide its tokens.

Each bundle holds its own copy of this package. The remote's `NAV_CHARTS` is then a
different `Token` object from the shell's, and `federation()` binds the two by contract
key and token name, `meridian/NavCharts`.

## The version rule

`MERIDIAN_CONTRACT_VERSION` in `src/version.ts` is the contract's version. `federation()`
compares the version a remote was built against with the version the shell provides:

- The majors must match.
- A remote built against a newer minor than the shell fails with `NEXUS_CONTRACT_VERSION`.
- An older remote minor works with a newer shell from major 1 on. At major 0, every minor
  is a breaking change.
- With the same minor, the remote's patch must be no newer than the shell's.

Move the minor when the shell adds a token, and the major when a token's interface
changes in a way an older remote cannot read.

## The shared config

`@nexusdi/federation-contracts/shared` exports `meridianShared()`, the `shared` object
each project's `rspack.config.ts` passes to its `ModuleFederationPlugin`. It shares
`react`, `react-dom`, `@nexusdi/core` and `@nexusdi/react` as singletons.
`meridianShared({ core: false })` leaves core out, which the unshared build of
`federation-cartography` uses to show `NEXUS_CORE_NOT_SHARED`. The `.` entry imports
nothing from `./shared`, so a remote that bundles the contract bundles no build config.

## The rspack factory

`@nexusdi/federation-contracts/rspack` exports `meridianRemote({ name, port, decorators })`
and `meridianShell({ name, port })`, the rspack config of a station remote and of the shell.
A remote's `rspack.config.ts` is one call. The remote emits `remoteEntry.js` and the chunks
of `./section`, which is the remote's `src/index.ts`, and no page, since the shell is the
only page that loads it. `out`, `shared` and `contractAliases` select the drift and
unshared builds of `federation-cartography`. `@nexusdi/federation-contracts/swc` exports
the swc decorator settings the factory and a vitest config share.

## The test doubles

`@nexusdi/federation-contracts/testing` exports `FakeTactical`, a module named `Tactical`
that provides the three contract tokens over doubles: `FixedNavCharts`,
`RecordingCommandLink` and `FakeStationTelemetry`. `FakeShell` is a root that imports
`FakeTactical`, and `STATION_IMPORTS` is the load import the shell gives each station,
`{ imports: [FakeTactical] }`. A station test builds its container with
`nexusTest(test, FakeShell)` and loads its station with
`nexus.load(Station, STATION_IMPORTS)`, as the shell does. `stationLoad(Station)` is the
same load as a `check()` entry. The fixture builds a new container per test, so
`nexus.get(RECORDING_LINK).sent` starts empty and `nexus.get(FAKE_TELEMETRY).show(state)`
drives the feed.

## Commands

```sh
npx nx build @nexusdi/federation-contracts
npx nx test @nexusdi/federation-contracts
```
