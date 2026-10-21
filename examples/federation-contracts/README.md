# @nexusdi/federation-contracts

The `meridian` contract between the Meridian shell (`examples/federation-shell`) and its
two remotes, `federation-cartography` and `federation-command`. The package is private
and part of the federation demo.

```ts
import { defineContract } from '@nexusdi/federation';

export const meridian = defineContract({ key: 'meridian', version: '2.3.0' });
export const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');
```

## Who owns the contract

The shell owns it. The shell's `Tactical` module provides every contract token, so the
team that binds the providers decides what each token promises and when the version
moves. The remotes depend on this package and never provide its tokens.

Each bundle holds its own copy of this package. The remote's `NAV_CHARTS` is then a
different `Token` object from the shell's, and `federation()` binds the two by their
description, `meridian/NavCharts`.

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

## Commands

```sh
npx nx build @nexusdi/federation-contracts
npx nx test @nexusdi/federation-contracts
```
