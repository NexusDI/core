# @nexusdi/federation-life-support

A remote of the federation demo: the `life-support` station. It exposes `./section` with
the module `LifeSupportStation` and the component `LifeSupportPanel`. The station reads
the contract's `STATION_TELEMETRY` for the compartment air and sends the habitat's `online`,
`scrubber` and `oxygen` commands over `COMMAND_LINK`.

It serves on port 4306, and the shell (`examples/federation-shell`) loads it on
`/life-support`. The remote has no page of its own, only `remoteEntry.js` and the chunks of
`./section`.

## Commands

```sh
npx nx serve @nexusdi/federation-life-support
npx nx build @nexusdi/federation-life-support
npx nx test @nexusdi/federation-life-support
```
