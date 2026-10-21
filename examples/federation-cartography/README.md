# @nexusdi/federation-cartography

A remote of the federation demo: the `cartography` station. It exposes `./section` with
the module `Cartography` and the component `StarMap`. `Cartography` binds `NAV_ROUTES`
to `SectorRoutes`, which reads this bundle's own copy of the contract's `NAV_CHARTS`.
`federation()` in the shell binds that copy to the shell's by its key,
`meridian/NavCharts`, and `StarMap` shows `Kepler-442b: heading 42`.

It serves on port 4301, and the shell (`examples/federation-shell`) loads it on
`/charts`.

Two more builds show the failures the demo covers:

- `build-drift` writes `dist/drift`. Its contracts package reads the version from
  `drift/version.ts`, the next minor of the shell's contract, so the shell's `load()`
  fails with `NEXUS_CONTRACT_VERSION`. The e2e suite serves it on 4303.
- `build-unshared` writes `dist/unshared`. It leaves `@nexusdi/core` out of the shared
  packages, so its module comes from another copy of core and `load()` fails with
  `NEXUS_CORE_NOT_SHARED`. The e2e suite serves it on 4304.

## Commands

```sh
npx nx serve @nexusdi/federation-cartography
npx nx build @nexusdi/federation-cartography
npx nx build-drift @nexusdi/federation-cartography
npx nx build-unshared @nexusdi/federation-cartography
npx nx test @nexusdi/federation-cartography
```
