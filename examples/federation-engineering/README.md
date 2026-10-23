# @nexusdi/federation-engineering

A remote of the federation demo: the `engineering` station. It exposes `./section` with the
module `EngineeringStation` and the component `EngineeringPanel`. The station reads the
contract's `TELEMETRY_FEED` and shows the reactor, coolant and power gauges. It sends no
command.

It serves on port 4305, and the shell (`examples/federation-shell`) loads it on
`/engineering`. The remote has no standalone page: `index.html` points at the shell.

## Commands

```sh
npx nx serve @nexusdi/federation-engineering
npx nx build @nexusdi/federation-engineering
npx nx test @nexusdi/federation-engineering
```
