# @nexusdi/federation-engineering

A remote of the federation demo: the `engineering` station. It exposes `./section` with the
module `EngineeringStation` and the component `EngineeringPanel`. The station reads the
contract's `TELEMETRY_FEED` and shows the reactor and coolant gauges and the power budget.
It sends no command.

It serves on port 4305, and the shell (`examples/federation-shell`) loads it on
`/engineering`. The remote has no page of its own, only `remoteEntry.js` and the chunks of
`./section`.

## Commands

```sh
npx nx serve @nexusdi/federation-engineering
npx nx build @nexusdi/federation-engineering
npx nx test @nexusdi/federation-engineering
```
