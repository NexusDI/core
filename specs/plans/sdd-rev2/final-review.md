# Final whole-branch review: NexusDI core 0.4 revision 2

Range 03f2aca..bf3df20 (63 commits, 326 files). Reviewer: final wave, read-only. The checkout was left clean (`git status` empty after every gate; toolchain-matrix.json unchanged by the matrix run).

Verdict: not ready to merge as is. One parity break against D15 (Critical), four Important items, 24 Minor items, and a list of owner decisions. Every gate is green.

## Gate results

| Gate | Result |
| --- | --- |
| `npx nx run-many -t lint test build typecheck` (dist deleted, `--skip-nx-cache`) | pass, 14 projects, 1,653 tests (core 899) |
| `npm run verify:packaging` | pass (CJS require on Node 22.12.0 and 24.21.0, no TLA, types under nodenext and bundler, Rollup and esbuild bundles) |
| `npx prettier --check .` | pass outside `.superpowers/` (all 79 warnings are workspace files) |
| `npx fallow dead-code --fail-on-issues` | pass, no issues |
| `npx fallow dupes` | pass, 1.6% (threshold 2.6) |
| `npm run check:type-floor` | pass (TS 5.4 and TS 7) |
| `npx nx run @nexusdi/toolchain-matrix:matrix` | pass, 18 cells, committed json unchanged |
| `npm run size` | core 18,671 B; decorators 1,270, devtools 4,703, errors 4,389, federation 468, node 92, testing 1,130 |
| `npx nx run @nexusdi/core:bench`, run 1 | pass (slowdowns -3.0% to +1.1%, noise 6.5% to 64.6%) |
| `npx nx run @nexusdi/core:bench`, run 2 | pass (slowdowns -2.8% to +2.6%, noise 7.0% to 27.6%) |
| three extra short runs (`--blocks 3 --rounds 5`) | all pass; slowdowns ranged -6.6% to +11.8% with noise 4.3% to 70.6% |
| commitlint over all 63 messages | pass; every message carries both trailer lines |

The cached first gate run also passed. The levels.test.ts flake (R9 note) and the dist race (R19 note) did not recur: R24's `test.dependsOn: ["^build", "build"]` and the 60 s limit on the long-chain test address both.

## Critical

### C1. With `errors()` registered, a core error that fails an async build keeps its one-line text inside the ProviderError (D15 parity break)

- Where: `libs/core/src/runtime/settle.ts:85` (`toProviderError` wraps the level failure as `cause`), `libs/core/src/runtime/build.ts:151` (`providerFailure`), `libs/core/src/plugins/format.ts:71` (`formatThrown` formats the ProviderError and never its `cause`).
- Evidence: scratch probe against a revision 1 bundle built from 03f2aca's source and the head dist, the same scenario with `errors()` on head:
  - `create` of `Root { provide(T, { useFactory: async () => 1, lifetime: 'transient' }), class A { static deps = [T] } }`
    - revision 1: `[NEXUS_PROVIDER_FAILED] A (module Root) failed: AsyncTransientError: [NEXUS_ASYNC_TRANSIENT] T (module Root) is transient and its factory returned a promise. get() is synchronous and cannot wait for it.\n  Fix: use lifetime: 'scoped', or make the token a function type and provide () => Promise<T>.`
    - head: `[NEXUS_PROVIDER_FAILED] A (module Root) failed: AsyncTransientError: [NEXUS_ASYNC_TRANSIENT] token=T module=Root. https://nexus.js.org/errors/NEXUS_ASYNC_TRANSIENT`
  - `createScope()` with a scoped factory that depends on the same async transient: the same difference.
  - The synchronous paths (`get()` of a transient or a scoped class needing it) match revision 1, because `inFrame` rethrows the NexusError bare and `guard` formats it.
  - The same gap affects the new errors: a construct hook that throws or returns a thenable gives `A (module root) failed: PluginError: [NEXUS_PLUGIN_FAILED] plugin=c hook=construct. https://...` with `errors()` registered, although `errors()` has text for NEXUS_PLUGIN_FAILED (`the construct hook of c failed: ...`). A `NEXUS_LAZY_ASYNC` reached as a dep of an eager provider at `create` is the same case.
- Why it matters: spec §0 D15 and §9.1 promise revision 1's text "character for character" with `errors()`, and §9.1 says core formats "every NexusError that core raises inside an operation"; only a value user code threw stays unformatted. These causes are raised by core. The parity suite has no scenario where a core-raised error is the cause of a ProviderError from an async build, so it did not catch this.
- Fix: mark the errors core raises in the runtime (a module-level `WeakSet` in `plugins/format.ts`, filled by a small `raised(error)` helper at the throw sites in `build.ts` (`asyncBuildError`, `constructFailed`, `notBuilt`, the NotReady and ScopeRequired sites), `lazy.ts` and `scope.ts`). In `formatThrown`, before formatting a `ProviderError`, format its `cause` and each `alsoFailed[i].cause` that is in that set, with the same view. A NexusError that user code rethrew (for example from another container's `get()`) is not in the set, so §9.1's "never formats a value user code threw" still holds. Add parity scenarios in `libs/errors/src/parity/operations.test.ts` for: an async transient as a dep at `create`, at `createScope`, at `load` and at `extend()`; and a `NEXUS_PLUGIN_FAILED` construct-hook cause with `errors()` registered. No hot-path cost: every change sits on a failure path.

## Important

### I1. Core grew 16% over revision 1; the pull request needs its `## Size` section and the owner a decision on the D5 estimate

- Evidence: the size fixture (`examples/size/src/core.ts`, which also compiles against 03f2aca because it uses `defineModule`) bundled with esbuild `--minify` and gzip 9: revision 1 source 16,082 B, head 18,670 B (the dist measures 18,671 B). Minified bytes by layer: `errors/` 10,470 to 3,016 (the D15 and D21 saving works), but `runtime/` 17,715 to 25,656, `blueprint/` 17,749 to 20,761, and the new `plugins/` 3,607. Spec §0 D5 estimated core at 13.5 to 14.5 KB after the move.
- `examples/size/consolidation.json` starts at "revision 2 features (R1 to R16)" = 18,135 and has no revision 1 record, so the report never shows the growth over revision 1.
- Fix (implementer): add a first record `{ "step": "revision 1 (03f2aca)", "core": 16082, "delta": 0, "kept": true }`, measured with `size-report.mjs --root` on a 03f2aca worktree so the method is the script's own. Write the `## Size` section for the revision 2 pull request (the ledger's R25 note) with the per-layer table above. The owner decision is listed below.

### I2. Two plugins that pin one token: the later pin silently undoes the earlier plugin's rewrite

- Where: `libs/core/src/blueprint/hooks.ts:263-266,328` ("the later pin wins").
- Evidence: plugins `x` and `y` each return `{ with, pin: true }` for a different contribution of MultiToken `M`; `create` succeeds and `get(M)` is `["Y"]`. Plugin `x`'s rewrite is gone with no error.
- Why it matters: spec §3.10.2's conflict rule exists so one plugin cannot silently override another's rewrite, and §3.10.9 says a plugin cannot change which provider a token binds to after another decided. A pin removes every other provider of the token, so two pins from different plugins decide the same thing twice. (Deferred from R3 as a minor; it is a cross-plugin correctness hole once third-party plugins exist.)
- Fix: in the pin bookkeeping, when a second pin for the same key comes from a different plugin, push `NEXUS_PLUGIN_CONFLICT` with `plugins: [first, second]` and `target` the token's display name, as `decide()` does for one provider. Keep "later pin wins" only for two pins from the same plugin, or make that a conflict too. Add the test to `libs/core/src/runtime/compile-hooks.test.ts`.

### I3. The dispatch benchmark's noise bound is too wide to detect the cost it exists to catch, and too jittery near its edge

- Where: `libs/core/bench/dispatch.mjs` (samples of about 1 ms for `get 50`, `createScope 50` and `createScope 2000`), `libs/core/bench/stats.mjs:37-50` (`decide`).
- Evidence: in the two default runs the noise bound (the largest of 14 A/A gaps) was 6.5% to 64.6%; `get 2000` had 64.6% and 27.6%. R21a's original finding was a 5 to 12% slowdown, which today's default run would pass in most scenarios. In three short runs the slowdown itself moved between -6.6% and +11.8% for identical code, so the verdict rides on per-sample jitter (1 ms samples, timer resolution, GC and tier-up) in both the effect and the noise.
- Fix, keeping the rule ("fail when the slowdown exceeds the noise measured for the pair"): lengthen every sample, not the rule.
  1. Calibrate each operation like `createReps` does for `create`: in block -1, pick an inner repeat count `k` so one sample of `get` (10,000 calls), `createScope` (1,000 calls) or `create` runs about 10 ms, and time `k` repetitions per sample, reporting the per-repetition time. Both the effect and the A/A gaps shrink by about the square root of `k`, so the comparison stays like for like.
  2. Keep 7 blocks and the max-of-gaps noise estimator; with 10 ms samples it becomes both tighter and steadier.
  3. Print `k` per scenario in the table header line, and add a stats test that a synthetic 5% slowdown with 1% jitter fails and a 0% one with 1% jitter passes over 7 blocks, so a later change to the estimator cannot quietly loosen it.
  4. Optional: when a scenario fails, rerun that scenario once with fresh copies and fail only when both runs fail. A real cost reproduces; a jitter spike does not.

### I4. A ProviderError from `create`, `load` or `createScope` rolls back without calling the plugins' `dispose`, and a failed `setup` leaves earlier plugins' setup unmatched

- Where: `libs/core/src/runtime/nexus.ts:277-312` (setup failure disposes instances only).
- Evidence: plugins `a` (setup and dispose) and `b` (setup throws): calls are `['a setup']`; `a`'s `dispose` never runs.
- Why it matters: §3.10.5 names `setup` as where a plugin acquires container-scoped resources (a telemetry exporter, a registry entry) and `dispose` as where it releases them. After a failed `setup` of a later plugin, the earlier plugin's resources leak. The spec is silent on this case (see owner decisions); the least surprising behaviour mirrors container disposal.
- Fix (if the owner agrees): after a setup failure, run the `dispose` hook of every plugin whose `setup` already ran, in reverse order, and chain their errors into the PluginError's `disposalErrors`. A failed build before any `setup` needs nothing.

## Minor

1. `.fallowrc.jsonc:239-242`: "Today's figure is 2.5%" is stale (fallow dupes reports 1.6%), and the ratchet was never lowered. Fix: set `"threshold": 1.7` and write "Today's figure is 1.6%."
2. Optional package manifests have no `"dependencies": {}` (`libs/{decorators,testing,node,errors,federation}/package.json`), which spec §12.2 shows. Fix: add the empty object and make `tools/repo-checks/src/package-versions.test.ts` assert `dependencies` is `{}` for each optional package and `{ "@nexusdi/errors": <version> }` for devtools.
3. `libs/core/package.json:5-21` keywords still list `decorators` and `lightweight`; core has no decorators, and the owner's D5 wording avoids the size claim. Fix: drop both; add `nexusdi-plugin` to errors, devtools, testing and federation (spec D19 names that keyword for plugins).
4. `AnyToken` is not exported from `libs/core/src/index.ts`, yet it types `NexusPlugin.tokenKey`, `ProviderView.token`, `EdgeView.token` and `BlueprintView.visible` (spec §3.10.1 declares it). A plugin author cannot name it. Fix: `export type { AnyToken } from './definitions/guards.js';` and add it to index.test.ts's type export list.
5. `libs/testing/src/index.ts:143`: `createTestingContainer(root: ModuleRef)` takes no provider array or root object, while `Nexus.create` takes `RootRef` since R12 (D1). Fix: type it `<P, Q>(root: RootRef<P, Q>)` and pass it through unchanged; add a test with `createTestingContainer([Logger, UserService]).override(...)`.
6. `libs/devtools/src/trace.ts:9`: every `trace(fn)` plugin is named `nexus:trace`, so `plugins: [trace(log), trace(metrics)]` fails with `duplicate-name`. Fix: accept an optional `name` (`trace(fn, { name })`), or document one trace per container in the README with the `devtools({ trace })` alternative.
7. `libs/testing/src/plugin.ts:130`: an override keyed by one copy of a federation contract token does not match a provider written with another copy (`NEXUS_OVERRIDE_UNUSED`), although `get()` treats both as one key. Fix: document in the testing README that `override()` takes the token the provider wrote; a proper fix needs a key lookup on `CompileContext` (owner, since it is plugin API).
8. `libs/core/src/blueprint/visibility.ts:233-262`, `blueprint.ts:116`, `compile.ts:224`: `Blueprint.exportedTokens` has no reader left in core (its readers, near-misses and overrides, moved out). Each compile still runs `exported(i, token)` over every module times the token universe. Only revision 1's `visibility.test.ts:204` reads it. Fix: a consolidation step that drops the field and rewrites that test on `moduleExports` needs a ruling (it changes a revision 1 test); record it in consolidation.json.
9. `libs/core/src/index.ts:8`: `DOCS_URL` is a runtime export no package uses and the spec does not list. Fix: drop the export (keep the constant internal), or have `@nexusdi/errors` use it.
10. PluginError carries every field of all four codes on every instance (`libs/core/src/errors/plugin-error.ts:37-47`): a spread NEXUS_PLUGIN_FAILED prints `reason: null, detail: [], apiVersion: null, supported: [], plugins: [], target: null`. InvalidTokenError from `get()` likewise prints `module: null, index: null, reason: null, detail: []`. It follows P29, but the spread logs are noisy. Fix: none required; if the owner wants per-code keys, `errorBase` can take a per-code field list.
11. `libs/core/src/errors/nexus-error.ts:28-33`: the public `NexusError` constructor is `(code, name, fields, options)`, where spec §9 shows `(code, fields, options)`. The owner accepted the `errorBase` form, but no README shows a third-party plugin how to declare its error class. Fix: add a short "Errors in a plugin" block to the core README's Plugins section with `errorBase` and the `NexusErrorByCode` augmentation, as testing, devtools, decorators and federation do.
12. `libs/core/src/errors/nexus-error.test-d.ts` "knows every core code" asserts only `NexusErrorCode extends string`. Fix: assert `keyof NexusErrorByCode` equals the 28 core codes.
13. With a root named `root`, the missing-provider fix line reads "provide X in root or in a module root imports." Fix: in `@nexusdi/errors`' builder, write "in the root module or in a module it imports" when the module is the anonymous root (new text only for the D1 root, so no parity change).
14. `libs/core/src/regressions/r17-disposed-public-methods.test.ts` lost its `runInScope` line (correct, D20) but gained no `scope.extend()` line, although spec §6.2 lists `extend` among the methods that throw NEXUS_DISPOSED. Probe confirms `extend()` rejects `NEXUS_DISPOSED` once the root disposes. Fix: add the assertion to R17.
15. `RELEASING.md:150` keeps an em dash on a line this branch edited. Fix: rewrite the sentence without it.
16. Antithesis comments added by this branch: `.github/workflows/size-report.yml:32,34` ("not the synthetic merge commit", "not the merge base"), `.fallowrc.jsonc` size-report entry ("not by import from anything"), `libs/core/src/runtime/lazy.ts:81-82` ("must come from this closure, not from constructionStack.top()"). Fix: state the positive fact only.
17. `.github/workflows/ci.yml` bench job checks out without `persist-credentials: false`, which the size workflow sets. Fix: add it.
18. `scripts/size-compare.mjs:26,29` writes an em dash as the empty table cell. Fix: use `n/a` or leave the cell empty.
19. fallow dupes: `libs/core/src/runtime/nexus.ts` and `scope.ts` repeat the `has`, `resolve` and `validate` wrappers (3 clone groups, 23 lines). Fix: one shared helper per method taking the container state, as `rootGet`/`scopeGet` already do.
20. `libs/core/src/plugins/registry.ts`: two errors can name the same plugin twice with different identities (index for a hole, name for a duplicate), as P32 decided. No change; noted for the plugin guide.
21. The `compile.module` hook runs twice per module during `load()` (admitLoad's walk, then the compile), by design (R3 deferred). Fix: say so in the plugin section of the core README, so a third-party hook with side effects keys its state by `context` as `@nexusdi/testing` does.
22. `@nexusdi/testing`'s `override()` of an `eager: false` provider makes the replacement eager (the rewrite keeps lifetime, not `eager`), so a test builds at `create` what production defers. Probe: `graph()` shows `eager: true` and the fake factory ran at `create`. Fix: document it, or keep an own `eager` of the original record unless the entry sets one (spec §3.10.3 names only lifetime; owner call).
23. Deferred minors worth a fix now, from the ledger: R13 "deps: null treated as no deps" (reject with `bad-deps`, a one-line records.ts change); R25 "a dependency on a token that failed the kind check also reports NEXUS_MISSING_PROVIDER" (skip the bind for a token in `failedOn`). The rest (R3 shadowed NAMES and blank line, R5 NearMiss shapes, R7 message-scenarios copy and unreachable near-miss branches, R8 M5/M7, R9 path conventions, R10 packed-list duplication, R11 frozen parent metadata, R14 transient ownership edge, R15 PROVIDER_FAILED edge and failed on-demand builds in `root.owned`, R16 modifier brand, R23 README nits, R25 strong `byKey`) are safe to leave for after rc.0.
24. `libs/core/src/runtime/nexus.ts:293` failure path: a failed `setup` disposes `state.owned` but does not await in-flight `load()`/`createScope()` a setup hook may have started (R4 M2). Fix together with I4: mark the root disposing and await the in-flight sets, as `disposeRoot` does.

## Spec conformance walk

Present and consistent: D1 (array and object roots, `root` name), D4 (`forRoot`, `forRootAsync`, `with` gone, repo-wide), D9 (seven packages, entry-only imports, exact peers), D10 (`extend()` rules 1 to 7, probed with federation, testing lazy overrides and eager: false), D11 (types, runtime reasons `eager-not-deferrable` and `bad-eager`, NEXUS_LAZY_ASYNC), D12 and §17.2 (one method, fixture per package), D13, D14, D15 (except C1), D16, D19 (registration, order table, views frozen, tokenKey, construct, observe, setup, dispose, modules; probed across plugins), D20 (`nodeScopes`), D21 (thin classes, `isNexusError` across two copies of core, probed), C3 (brand, `otherCopy` on modules, providers, tokens and `@Module` classes, text through `errors()`, probed with a second copy of the dist), §6.6, §7.4, §8.1 (with the R15 owner ruling), §8.2, §10 (with plan decision 3), §12.1 (with P18), §12.3, §12.4 (workflow written; never run on GitHub), §17.3 (bench present; see I3).

Half built or moved elsewhere, all recorded: D3, D17 and the codemod (§13.2, other plans); D6 guides and §14.1 (docs plan, ruling on R23); D18 React (own spec); §12.4 item 6 README wiring to `size.json` (owner, P19); §17 "each package's tests run against the packed core tarball" (P37, owner).

Contradictions between rulings and the spec: none unrecorded. Two recorded ones the owner should see again together: P37 departs from §17's dogfooding sentence, and plan decision 2 (`otherCopy: boolean`) means neither core nor `errors()` can name the other copy's version, which §0 C3 and §9.1 describe ("names both versions").

## Public API

- `@nexusdi/core` removals against 03f2aca: `LegacyDecoratorsError`, `Inject`, `Injectable`, `Module`, `ModuleDecoratorConfig` (to decorators, D9), `NoScopeContextError`, `ScopeContext` (D20), `OverrideError` (to testing, §9), `NexusGraph` (to devtools, §10), `OptionsFactory` (R13, D4), the `./node` and `./testing` subpaths (D9). Every removal is covered by the spec or a brief.
- Additions: `errorBase`, `isNexusError`, `DOCS_URL`, `PluginError`, `LazyAsyncError`, the reason unions, `ErrorFields`, `NexusErrorOptions`, `MissingLookup`, `NexusErrorByCode`, `Class`, `Ctor`, `DepsFor`, `FactoryDefinition`, `OverrideDefinition`, `LazyAsyncMessage`, `PromiseTokenMessage`, `ForRootAsyncConfig`, `declareClass`, `declareProperty`, `declareModuleClass`, `moduleDefinitionOf`, `CheckOptions`, `RootConfig`, `RootRef`, `NexusPlugin`, `PluginContext` (with `asyncFactory`, decision 3), `NEXUS_PLUGIN_API`, `SUPPORTED_PLUGIN_APIS`, the view types, `EdgeView.token` (R25, additive). `AnyToken` is missing (Minor 4); `DOCS_URL` is unrequested (Minor 9).
- decorators: `Inject`, `Injectable`, `Module`, `ModuleDecoratorConfig`, `LegacyDecoratorsError`. devtools: `devtools`, `graph`, `DevtoolsOptions`, `DevtoolsError`, `NexusGraph`, `inspect`, `trace`, `TraceEvent`. errors: `errors`, `explain`. federation: `defineContract`, `Contract`, `ContractVersionError`, `federation`. node: `nodeScopes`, `NodeScopes`. testing: `createTestingContainer`, `TestingContainerBuilder`, `TestingCreateOptions`, `ModuleOverrideOptions`, `OverrideError`, `OverrideDefinition`. Each matches spec §0's package table.
- Type floor and type tests pass on TS 5.4, 6.0.3 and 7.

## Revision 1 tests

Titles in 03f2aca's `libs/**` tests missing at head: 27, each accounted for: the `with()` titles renamed to `forRoot` (R13), the ambient-scope tests replaced by `nodeScopes` tests and the NO_SCOPE_CONTEXT parity test (R9, D20), R15 split into two files (P39), the testing export list (P24), the security register (P13), SEC-010 moved to devtools (P13). Files with fewer assertions: R17 (the `runInScope` line, D20), R15 (split), core `tier1-prevented` (one assertion moved with SEC-010). Every `[NEXUS_...]` message literal a revision 1 test asserted appears in a head test or the parity snapshot. The parity snapshot holds 67 messages covering every revision 1 code; C1 is a scenario it lacks.

## Ledger notes evaluated

- The dispatch benchmark: I3 above.
- levels.test.ts flake and the dist race: resolved by R24; not reproduced under `--skip-nx-cache`.
- R25 size note: I1.
- R26 contract versions: owner items below.

## Owner decisions (not fixable by an implementer)

1. Core size (I1): 18,671 B against revision 1's 16,082 B and D5's est. 13.5 to 14.5 KB. Accept the figure for rc.0 with the `## Size` section, or order a consolidation pass on `runtime/` and `blueprint/hooks.ts` before rc.0. Also decide whether the first 0.4 pull request against `main` (whose base cannot build the fixture, R22 ruling) must still carry a `## Size` section.
2. `otherCopy` without `errors()` (R16 owner item): the one-line message omits it, so a user with no plugin sees `received=an object` and no hint of a second core, which is C3's purpose. Options: print boolean fields that are true in `lineOf` (`otherCopy=true`), or keep as is.
3. Plugin `dispose` after a failed `setup` (I4): run the dispose of plugins whose setup ran, or leave the spec silent.
4. Two pins from different plugins (I2): conflict, or documented last-wins.
5. `override()` of an `eager: false` provider (Minor 22): keep `eager` like `lifetime`, or not.
6. Federation: an invalid contract version is a `TypeError`, not a Nexus code (R26); prerelease contract versions such as `2.3.0-rc.1` are rejected (R26), which blocks contracts packages that publish RCs in the same window.
7. Testing overrides keyed by token identity under federation (Minor 7): a key lookup on `CompileContext` would be a plugin API addition.
8. The root object's extra-key error names no key (R12 owner item): needs a spec §9 field.
9. P37 (package tests on workspace resolution, not the packed tarball) and plan decision 2 (`otherCopy: boolean`, so no version names) depart from §17 and §0 C3's wording; confirm both stand.
10. `size.json` to README wiring (P19) and running `size-report.yml` and the bench job on a real GitHub runner before rc.0 (neither has run there).
