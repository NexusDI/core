# Preflight conflict scan: core 0.4 revision 2 plan (R1 to R26)

Plan: `.superpowers/plans/2026-09-24-core-0.4-revision-2.md` (7739 lines). Spec: `spec.md` in this folder (binding). Repo: `/home/user/core-0.4` at `03f2aca` (feat/core-0.4). Read-only scan; nothing in the repo was edited.

Plan line numbers are `L<n>`. Repo paths are relative to the worktree root.

## Already accepted by the owner (progress.md), so not findings

- Decision 1, the `errorBase` form (and with it `NexusError(code, name, fields, options)` in place of spec §9's `(code, fields, options)`).
- Decision 2, `otherCopy: boolean` in place of spec §9's `string | null` and a version-holding brand.
- `moduleDefinitionOf` as new public API (R8).
- `reason` ids with a `detail` field (decision 8).

Rulings below leave these as they are.

## Severity key

- High: a task's own tests, or the gate, fail as written. Must be fixed before or during that task.
- Medium: spec divergence, cross-task gap or a missing piece that a later task or the gate trips on.
- Low: wording, coverage gaps, small spec drift.

---

## High

### P1. R1, R5, R7: a message scenario ignores the plugins it is given

- Plan L499-L520: the `a useClass binding to a class without deps` scenario calls `compile()` directly and ignores `plugins`.
- R5 (L3195-L3198) runs every scenario with `[textPlugin()]` and compares against R1's snapshot without `--update`. From R5 on, a `BlueprintError` built by `compile()` carries the one-line message (L2905-L2920), and no formatter runs on a bare `compile()`. The snapshot comparison fails in R5.
- R7 (L3767) patches it by switching to `Nexus.check`, which only exists from R6, so R5 has no fix of its own.
- Ruling: in R1, write that scenario as `rejected(Nexus.create(root, options(plugins)))`. `create` compiles the same graph and rejects with the same `BlueprintError` text, so R1's snapshot is the same. Drop the R7 note.

### P2. R5 breaks revision 1 assertions it does not list, and misses constructor call sites

R5 L3202 lists nine message assertions. These revision 1 assertions also break in R5 and are not listed:

- `message:` inside `toMatchObject`: `libs/core/src/blueprint/records.test.ts:54`, `:295`, `:311`, `:680`.
- `reason:` sentences, which become ids in R5: `records.test.ts:222-276` (the table), `:600-635` (the `classErrors` table), `:731`, `:760`; `libs/core/src/security/tier1-prevented.test.ts:158`, `:177`, `:505`, `:713`.
- `libs/core/src/runtime/scope-context.test.ts:32` (`toContain('nodeScopeContext()')` on `NoScopeContextError` text). It breaks in R5 and is deleted in R9.

Constructor call sites R5 has to change but does not list: `test-support/error-cases.ts` (R1's `requester: null` cases have no `entry`; the `ProviderError` case passes `cause` as a field; the `InvalidTokenError (providers entry with reason)` case stores a sentence), `blueprint/hooks.ts` (R3 `failed()` passes `cause` as a field), and `runtime/plugins.ts` and `runtime/nexus.ts` (R4 `constructFailed` and the setup failure pass `cause` as a field). The plan also says every other error site passes new `null`/`[]` fields (L2811), which covers most of `blueprint/` and `runtime/`, not only the files L2499-L2500 name.

- Ruling: add every file above to R5. Convert the `message:` and `reason:` assertions the same two-mode way as L3202: the core mode asserts `reason: '<id>'` plus `detail`, and the text mode (the errors parity suite from R7) keeps the sentence. Move every `cause:` field into the options argument.

### P3. Revision 1 tests pin the export list and `RootInit`, and export-changing tasks do not update them

- `libs/core/src/index.test.ts:49-52` asserts `Object.keys(api)` exactly equals `RUNTIME_EXPORTS`. That list changes in R2 (`NEXUS_PLUGIN_API`, `SUPPORTED_PLUGIN_APIS`, `PluginError`), R5 (`errorBase`, `isNexusError`, `DOCS_URL`), R8 (`moduleDefinitionOf` in, `OverrideError` out), R9 (`NoScopeContextError` out), R11 (`declareClass`, `declareProperty`, `declareModuleClass` in; `Inject`, `Injectable`, `Module`, `LegacyDecoratorsError` out) and R15 (`LazyAsyncError`). No task lists `index.test.ts`.
- `runtime/startup.test.ts:341,370`, `runtime/lazy.test.ts:222` and `runtime/init.test.ts:282` call `createRootState` with `overrides: undefined` (and the `scopeContext` key). R8 removes `RootInit.overrides` (L4105) without naming these tests, so typecheck fails on excess properties. R9 only says "every core test that passes `scopeContext`".
- Ruling: add `index.test.ts` to R2, R5, R8, R9, R11 and R15. Add the three `createRootState` callers to R8 and R9. These are deliberate list edits, which P23 allows.

### P4. R3: three compile-hook tests expect one error and get three

The fixture (L1314-L1331) has `Engineering` and `Meridian` both export `REACTOR`. Removing or stubbing the `REACTOR` provider also makes those exports invalid (`libs/core/src/blueprint/visibility.ts:278-290` reports `NEXUS_INVALID_EXPORT` when an exported token has no lookup):

- `validates the replacement like any module` (L1357-L1375): errors are `[INVALID_EXPORT Meridian, INVALID_EXPORT Broken]`, and the test expects exactly `[INVALID_EXPORT Broken]`.
- `removes a provider, and the compiler reports its dependents` (L1412-L1433): two `INVALID_EXPORT` errors come before `MISSING_PROVIDER`.
- `reports two plugins that rewrite one provider` (L1435-L1452): the winning `{ remove: true }` adds the same two `INVALID_EXPORT` errors after the conflict.
- Ruling: assert with `expect.arrayContaining`, or use fixtures that do not export the removed token. For the conflict test, have both hooks return `{ with: provide(REACTOR, { useClass: FakeReactor }) }` so only the conflict is reported.

### P5. R6: the first `Nexus.check` test is an import cycle

L3255-L3276 compiles root `Engineering` and loads `Science`, which imports `Engineering`. `walk()` pushes the root on its stack before it visits the extra imports (`libs/core/src/blueprint/walk.ts`, `visit`: `stack.push(definition)` then `[...definition.imports, ...extra]`), so `Science → Engineering` is `NEXUS_MODULE_IMPORT_CYCLE`. `check` throws, and the test expects `undefined`.

- Ruling: use `Nexus.check(defineModule({ name: 'Root', imports: [Engineering] }), { load: [Science] })`.

### P6. R16: `isForeign` flags this copy's own definitions

R16 brands every Token, MultiToken, `provide()` result and module this copy makes with `true` (L6086-L6100), and each rejecting site passes `otherCopy: isForeign(value)`. A value that this copy made and rejected also has the brand:

- `normalizeProvider`'s `is-a-module` path (a module listed in `providers`): the entry is this copy's module.
- `depOf`'s `bare-multi-token` and `resolve()`'s bare MultiToken entry: the value is this copy's MultiToken. R1's scenario `resolve() with a bare MultiToken entry` (L430-L439) then renders "made by another copy of @nexusdi/core" and the parity snapshot changes. R16 Step 4 (L6114) claims new entries are the only snapshot changes.
- `get(someModuleDefinition)` in `lookup.ts`.
- Ruling: `brand.ts` keeps a module-local `WeakSet` of every value `brand()` marked. `isForeign(v)` is true only when `v` carries the registered brand and is not in that set. The boolean field, which the owner accepted, stays.

### P7. R12 × R16: a branded foreign object becomes an empty root

`rootModuleOf` (L4984-L4999) treats any plain object with no extra enumerable keys as a `RootConfig`. `foreign({})` has only a non-enumerable symbol key, so `Object.keys` is empty and it compiles as an empty module named `root`. R16's `never accepts a value for its brand alone` (L6036-L6039) expects a rejection and gets a container. L5002's "R16 adds `otherCopy: isForeign(root)`" only covers the extra-key throw.

- Ruling: in `rootModuleOf`, return the value unchanged when `isForeign(root)` is true (with P6's definition), so compile rejects it as `NEXUS_INVALID_MODULE` with `otherCopy: true`. Also treat an own symbol key as an extra key.

### P8. R16: the brand test expects the wrong error order

L6028-L6033 expects `[INVALID_MODULE, INVALID_PROVIDER]`. `walk.ts` calls `addProviders(node, definition)` before it visits `definition.imports`, so `Shell`'s `providers: [foreign({})]` error comes first.

- Ruling: expect `[INVALID_PROVIDER, INVALID_MODULE]`.

### P9. R10: `inspect()`'s graph breaks its test and spec §10.1

`graphOf` (L4391-L4419) gives `async: false` to every class and value provider, including the built-in `REQUEST` record that every view holds (`bp.providers` includes it; R4's test at L2196 filters it for the same reason). The `inspect` test `view.providers.every((p) => p.async === null)` (L4338) fails. Spec §10.1 (spec L2815-L2816) says `async` is `null` "for every provider in `inspect()`'s graph".

- Ruling: give `graphOf` a mode, or pass `inspect` an `asyncOf` that returns `null` for every kind. Then the test and the spec agree.

### P10. R10, R11: the toolchain matrix still uses `trace`, `graph()` and `NexusGraph` from core

`examples/toolchain-matrix/src/run.ts:1-7,42-50` imports `NexusGraph` and `TraceEvent` from `@nexusdi/core`, passes `trace:` to `Nexus.create` and calls `ship.graph()`. R10 removes all three (L4532-L4534) and does not touch `examples/`. R11 edits only `src/decorated/meridian.ts` and `run-matrix.mjs` (L4811). `run-matrix.mjs:193-195` packs `libs/core` only. `golden.json` holds a graph that R10 changes by adding `eager` to each provider (L4386). So `npx nx run @nexusdi/toolchain-matrix:matrix` fails from R10 until R24's gate, and nothing fixes it.

- Ruling: R10 rewrites `run.ts` on `plugins: [devtools()]`, `graph(ship)` and `trace(fn)`. It packs and installs the `errors` and `devtools` tarballs in `run-matrix.mjs`, updates `golden.json` for the `eager` field, and adds `@nexusdi/devtools` and `@nexusdi/errors` to `.fallowrc.jsonc`'s `ignoreDependencies` next to `@nexusdi/core`. R11 then adds the decorators tarball as the plan says.

### P11. R13: two call sites outside `libs` and one packaging type

- `examples/react-ssr/app/shared/app.module.ts:17,24` call `LoggerModule.with(...)` and `UsersModule.with(...)`. R13 renames only what `grep -rn "\.with(" libs` finds (L5264), so typecheck and build of `react-ssr` fail in the gate.
- `scripts/verify-packaging.mjs:160` lists `OptionsFactory` in the CONSUMER's type imports. R13 removes the type (L5246) and does not touch the script.
- Ruling: R13 renames both `react-ssr` sites to `forRoot` and replaces `OptionsFactory` with `ForRootAsyncConfig` in `verify-packaging.mjs`. Widen the grep to `libs examples scripts`.

### P12. R7 × R8, R9, R11: the errors package keeps cases for classes that later leave core

R7 moves the full `error-cases.ts` into `libs/errors/test-support/` (L3383), importing every class from `@nexusdi/core`, and moves the builders for every code into `libs/errors/src/builders.ts`. R8, R9 and R11 remove `OverrideError`, `NoScopeContextError` and `LegacyDecoratorsError` from core and edit only core's `error-cases.ts` (L4105, L4243, L4756). The errors package then fails typecheck (imports that no longer exist). Its builders are keyed on codes no longer in `NexusErrorByCode`, its parity snapshot keeps obsolete entries, and R7's 100% branch threshold on `builders.ts` (L3774) no longer holds once the cases go.

- Ruling: each of R8, R9 and R11 also deletes that class's cases from `libs/errors/test-support/error-cases.ts`, its builder from `libs/errors/src/builders.ts`, and its snapshot entries (run the parity suite with `-u` and confirm the diff only deletes them). The owning package writes that text itself (`text` option), and `explain()` returns `undefined` for package-owned codes, as L3643 says.

### P13. R8, R10, R11: the core security suite depends on three features that leave core

`libs/core/src/security/tier1-prevented.test.ts` imports:

- `createTestingContainer` from `../testing/index.js` (line 38, used by SEC-003 at 266-287). R8 deletes that folder, and a core test cannot import `@nexusdi/testing` (graph cycle, decision 6).
- `../polyfill/symbol-metadata.js` and `registerModuleClass` (R11 moves and renames them). `tier3-contract.test.ts:5` also imports the polyfill.
- `ship.graph()` with `expectPlainGraph(NexusGraph)` from `test-support/security.ts` (SEC-010, lines 675-698). R10 removes `graph()` and the `NexusGraph` type. L4556 says the test "takes that route" (a view that `setup` captured), but a view holds classes and definitions and cannot pass `expectPlainGraph`.

Also, `security/register.test.ts` requires every `SEC-nnn` in `libs/core/SECURITY.md` to have a `describe` in core's `security/` folder. SEC-011 (lines 794-801) allows `Symbol.metadata` as a polyfill key.

- Ruling: R8 moves the SEC-003 override case to `libs/testing/src/security/`. R10 moves SEC-010 and `expectPlainGraph` to `libs/devtools`, and updates `libs/core/SECURITY.md` (or makes `register.test.ts` read the other packages' security folders). R11 switches the imports to `test-support/symbol-metadata.ts` and `declareModuleClass`. Add these files to each task.

### P14. R11: the new test imports what Step 4 puts elsewhere, and the package needs unexported types

- L4602-L4607 imports `declareModuleClass` from `./metadata.js`, but Step 4 defines it in `define-module.ts` (L4703-L4714). L4602 imports `test-support/symbol-metadata.js`, which Step 6 creates (L4802), so Step 3's expected failure is the wrong one.
- The decorators package consumes `DepsFor`, `Ctor` and `Class` from `@nexusdi/core` (L4588, and `libs/core/src/decorators/injectable.ts:8-9`, `module.ts:7`). `libs/core/src/index.ts` exports none of them, and R11 adds only the three functions (L4716).
- Ruling: import from `./define-module.js`, and create the polyfill helper in Step 2. Export `type DepsFor`, `type Ctor` and `type Class` from `index.ts` in R11.

---

## Medium

### P15. R11: two public signatures differ from spec §3.10.7

Spec (spec L1690-L1699) has `declareProperty(metadata, key, dep): void` and `declareModuleClass(cls, config): ModuleDefinition`. The plan has a required fourth `set` parameter (L4692-L4700) and returns the class (L4707-L4713). Neither is in the owner's accepted list.

- Ruling: make `set` an optional fourth parameter that defaults to assignment by key, which keeps the spec's three-argument call valid. `@Inject` still passes `context.access.set`. Return the `ModuleDefinition`: `Nexus.create` accepts it as a `ModuleRef`, so the tests pass it directly.

### P16. R3: provider rewrites run after the duplicate check, and `pin` applies only to a MultiToken

- Spec §5 (spec L2178-L2180) says `compile.provider` runs "after the walk, before any duplicate check". Revision 1 reports `NEXUS_DUPLICATE_PROVIDER` inside `walk()`'s `addProviders` (`walk.ts`), so the plan's hooks see records after duplicates were already reported. A plugin that removes one of two duplicates cannot prevent the error.
- `rewriteProviders` pins only when `record.token instanceof MultiToken` (L1740). Spec §3.10.3 gives `pin` for any token.
- Ruling: move the plain-token duplicate check from `addProviders` to `compile.ts`, right after `rewriteProviders`, iterating in walk order (same errors, same order). Honour `pin: true` for any token. R25 then keys that one check.

### P17. R6: `Nexus.check` skips `load()`'s own pre-checks

Spec §3.5 says `check` compiles each `options.load` module "as `load()` would". `load.ts` rejects a new global module (`newGlobalImport` → `NEXUS_LOAD_GLOBAL_MODULE`) and a value that is not a module before it recompiles. The plan's `check` (L3335-L3355) only appends to `extraImports`.

- Ruling: move `newGlobalImport` and the `resolveModuleRef` guard into a helper that both `loadNow` and `check` call against the previous compile's blueprint.

### P18. Decision 5 (layout) contradicts spec §12.1, and the owner has not accepted it

Spec §12.1 (spec L2956-L2992) puts `plugins/registry.ts`, `plugins/views.ts` and `plugins/format.ts` in a `plugins/` layer and lets `blueprint/` import `plugins/views.ts`. Decision 5 (L54) keeps them in `blueprint/` and `runtime/` because the current `tools/repo-checks/src/core-layers.ts` would forbid it. The spec, though, already rewrites those layer rules. Spec §12.1 also names `runtime/extend.ts` and `runtime/lazy-build.ts`, where the plan uses `scope.ts` and `build.ts`.

- Ruling: this needs an owner decision. The least divergent option is to add `plugins: ['plugins/', 'definitions/', 'errors/']` to `ALLOWED`, let `blueprint` import `plugins/views.ts`, and place the registry, views and formatter where the spec says. `applyConstruct` stays in `runtime/`, since it needs the runtime. The `extend.ts` and `lazy-build.ts` placement is cosmetic.

### P19. R22, R23: no `size.json` on `main`

Spec §12.4 item 6, §14.1 and D5 say the job writes `size.json` on `main`, and the README's size figure reads it. `size-report.yml` (L6950-L6952) runs on `pull_request` only, and R23 removes every size figure (L7078-L7080).

- Ruling: add a `push: branches: [main]` trigger (or a second job) that runs `node scripts/size-report.mjs --json size.json` and publishes it, as an artifact or a commit, as the owner prefers. Leave R23's no-hand-figure test as it is. Or record an owner deferral.

### P20. Spec §17.3 and D19: the dispatch benchmark has no task

Spec §17.3 wants `libs/core/bench` to compare `create`, `get` and `createScope` with and without hook sites, and to fail over the noise bound. D19's size note depends on it. No task creates it.

- Ruling: add a Group E task, or record the owner's deferral in the plan's decisions.

### P21. R5: `format.test.ts` is listed but never written

L2504 lists `libs/core/src/runtime/format.test.ts`, but R5 shows no content for it. Spec §17 requires `formatError` contract tests: a throwing hook leaves the line, an error is formatted once, and `explain()` returns the plugin's text.

- Ruling: R5 writes the first two, and R7 adds the `explain` parity test.

### P22. Versioning: `independent` with conventional commits cannot hold one version

Spec §12.2 says "`nx release` bumps every package together, so the seven packages always share one version", and §14 says the packages publish "at one version". The plan keeps `projectsRelationship: "independent"` (decision 9) and documents an explicit specifier. `release.yml` still runs conventional-commit mode when `specifier` is empty, and `RELEASING.md` "Releasing a subset" tells the reader to release a subset. `package-versions.test.ts` runs in the Verify step, before `nx release version`, so it cannot catch a split release.

- Ruling: this needs an owner decision. The least divergent option is `"projectsRelationship": "fixed"` in `nx.json` (the tag pattern can stay). The alternative is to keep `independent`, add a check after versioning in `release.yml`, and rewrite the subset section.

### P23. The global constraint on unchanged tests, and the self-review, are wrong

L19 says every revision 1 test moves "unchanged except for its imports", and that only R13 and R14 change strings. L7735 repeats it. The plan itself changes revision 1 tests in:

- R5: the two-mode rewrite, reason ids and one-line messages.
- R8 and R10: `trace:` and `graph()` replaced (L3850-L3871, L4556).
- R9: a line deleted from R17 (L4243).
- R11: `declared()` replaces decorator syntax.
- R13: 22 renames and a retitled regression.
- P2, P3, P12 and P13 above.

- Ruling: amend L19 to say assertion values stay unchanged, and allow the API-rename and relocation edits each task names, listed per task. Implementers otherwise hit a constraint no task can meet.

### P24. R8: `testing/exports.test.ts` is deleted, not moved

`libs/core/src/testing/exports.test.ts` asserts that the testing entry exports exactly `createTestingContainer`. R8 moves the other three test files (L3834), and the folder deletion (L4105) removes this one. The package also exports `OverrideError` (spec §9, L3920), so the old expectation cannot hold after a move.

- Ruling: move it to `libs/testing/src/exports.test.ts`, with the list `['OverrideError', 'createTestingContainer']` (a deliberate list edit).

### P25. R8, R16: the testing package builds `InvalidModuleError` differently from revision 1

L4101 uses `received: String(ref)`, while revision 1 uses `describeValue(ref)` (`libs/core/src/testing/index.ts`, `definitionOf`). R16 adds a required `otherCopy` field and updates only core's sites (L6100), so `libs/testing` fails typecheck after R16.

- Ruling: keep a local `describeValue` copy in `libs/testing/src/`, and add `libs/testing/src/index.ts` to R16 with `otherCopy: false`.

### P26. `fallow dupes`: test helpers copied across packages (plausible)

R7 keeps a trimmed copy of `error-cases.ts` in core next to the full copy in `libs/errors` (L3383). R8 copies `catch.ts` and `deferred.ts` into `libs/testing/test-support/` (L3850). Other packages will need the same helpers. `.fallowrc.jsonc`'s `duplicates.ignore` covers `*.test.*` but not `test-support/`. The baseline is 1.3% against a 2.6% threshold. R24's remedy (L7200: move into the package's `test-support/`) does not remove cross-package clones.

- Ruling: add `"**/test-support/**"` to `duplicates.ignore`, with a comment. That is a scope change, not a threshold raise. Or use one private `tools/test-support` package. Check `npx fallow dupes` at the end of R7 and R8.

### P27. R17: the size fixture imports six packages it does not declare (plausible)

`examples/size/src/*.ts` import `@nexusdi/core`, `errors`, `testing`, `node`, `devtools` and `decorators`, and `examples/size/package.json` (L6223-L6231) declares no dependencies. `.fallowrc.jsonc` needed an `ignoreDependencies` entry for the same pattern in `toolchain-matrix`.

- Ruling: declare `"dependencies": { "@nexusdi/core": "*", ... }` as `examples/react-ssr/package.json` does, and add each package as it appears (R26 adds `federation`).

### P28. R14: rollback errors from an aborted extend go to the root

L5525-L5528 pushes rollback disposer errors into `root.abortErrors` for any `DisposedError`. That covers a scope-disposal abort (the root may never dispose, so the errors are lost or blamed on the root) and a `DisposedError` thrown by user code while everything is open, which spec §8.1 treats as an ordinary `ProviderError`.

- Ruling: mirror `startBlueprint`. Push to `root.abortErrors` only when `root.disposing` is set. On a scope-disposal abort, hand the errors to that scope's disposal chain. Otherwise throw `toProviderError`.

---

## Low

### P29. R5: the one-line message and key order drift from spec §9 and §17

- `lineOf` (L2660-L2675) skips empty string arrays. Spec §9 prints "every field whose value is ... an array of strings".
- Own-key order follows each call site's object literal. `MissingProviderFields` puts `nearMisses` before `entry` (L2823-L2830), while spec §9's table has `entry` before `nearMisses`.
- Spec §17 wants `Object.keys(error)` to equal the class's field names in table order. R5's test only checks `toContain` (L2528-L2541).
- Ruling: declare and construct every fields interface in table order, and pin `Object.keys` per class in `nexus-error.test.ts`. Either print empty arrays, or get the owner to confirm skipping them.

### P30. R5 Step 5: a one-space typo in revision 1's text

L2960 writes `defineModule`'s text as `...is not a module.\n Fix: ...` with one space. Revision 1 has two spaces (`libs/core/src/errors/invalid-module-error.ts:14`). No snapshot covers `defineModule`'s own throw, so the drift would pass.

- Ruling: use `\n  Fix:`, and add a test that asserts this text.

### P31. R10, R12: `inspect()` collides with a caller's plugins and keeps the old root type

- `inspect` always registers `errors()` (L4490-L4497), so `inspect(root, { plugins: [errors()] })` fails with `NEXUS_PLUGIN_INVALID` `duplicate-name`. Spec §10 says `inspect` registers `devtools()`, which has the same problem.
- `inspect(root: ModuleRef)` is not widened to `RootRef` when R12 widens `Nexus.check`.
- Ruling: skip the built-in formatter when a caller's plugin is named `nexus:errors` or `nexus:devtools`. Widen `inspect` to `RootRef` in R12.

### P32. Review Focus 5 disagrees with R2's test and the spec

L42 says the same plugin object twice gives `NEXUS_PLUGIN_INVALID` naming `plugins[<index>]`. The R2 test (L651-L663) and spec §9 (spec L2668: "`plugin` is the plugin's `name`") name it `'twice'`.

- Ruling: keep R2 and the spec, and reword Review Focus 5.

### P33. Test titles

- L1490: the title says "complete view" while the test asserts `complete: false`.
- L31 wants one `describe` per callable export, but the R3, R4 and R15 describes name hooks or options (`compile.module`, `construct`, `eager: false`), not exports.
- Ruling: retitle L1490, and relax L31 for hook-level suites or rename them.

### P34. R25: the canonicalizer uses a `Map`, and files are missing

Spec §3.10.3 caches `tokenKey` per token object in a `WeakMap`. L7362 uses a `Map` that lives as long as the container. The Files list (L7237) omits `runtime/nexus.ts`, `runtime/load.ts` and `Nexus.check`, which create and pass `canon`.

- Ruling: use a `WeakMap` for `byToken`, and add the three files.

### P35. R13: new `forRootAsync` reasons lose their prefix

L5246 passes `'(the forRootAsync() factory)'` as a detail to `factory-not-a-function` and `deps-not-array`. Their `PROVIDER_REASONS` builders (L3000-L3002) ignore the detail, and the index points at `providers[length]`, an entry that does not exist.

- Ruling: have those two builders prefix a leading `(the ... factory)` detail, as `dependencyReason` does.

### P36. Spec §17 tests that no task writes

- `extend()`: rule 6 (scope disposal and root disposal during an extend), the visibility-superset test, and a `load()` that publishes during an `extend()` (R14).
- `eager: false`: through `resolve()`, a thenable from `onInit`, and disposal order with an instance built late (R15).
- One test per row of the §3.10.2 order table, and the `NexusPlugin` type tests (R2 to R4).
- Ruling: add them to the named tasks.

### P37. Spec §17: package tests resolve core's source, not the packed tarball

Spec §17 (dogfooding) says each package's tests run against the packed core tarball. The plan resolves `@nexusdi/core` through the workspace link and the `@nexusdi/source` condition. That keeps the entry-only guarantee (the exports map plus `package-imports.test.ts`), but it is not what the spec says.

- Ruling: get the owner to accept this, or run each package's tests against the tarballs inside `verify-packaging.mjs`.

### P38. R10, R11: the CommonJS consumer misses two packages

Spec §17 has the CJS consumer `require()` each optional package. R10 (devtools) and R11 (decorators) add nothing to `CJS_CONSUMER`.

- Ruling: add one `require` line each.

### P39. R10: R15 is split across two files

L4272 splits `r15-tokenless-provider.test.ts` between core and devtools. L31 says one file per R-number, and decision 6 does not list R15.

- Ruling: add R15 to decision 6, and name both halves `describe('R15')`, or keep R15 whole in devtools.

### P40. The scaffold procedure's wording and order

- Step 5 (L200) runs the `package-versions` and `package-imports` checks, which R7 creates in its own Step 2.
- Step 3 says "the task writes ... README.md" (L191), but the READMEs arrive in R23 (R26 writes its own).
- Step 4's `CONTRIBUTING.md` line `- **<name>**: ...` is a bold lead-in, against L34. The existing file uses that form (`CONTRIBUTING.md:58`).
- Ruling: note the R7 order and the R23 README timing in the procedure. For `CONTRIBUTING.md`, either keep the file's convention and record the exception, or change both lines to backticks without bold.

### P41. R7: `MissingLookup` is defined twice with different types

The Interfaces entry (L3393) has `token: AnyToken`. The code has `token: unknown` in core (L3701-L3704) and again in `libs/errors/src/near-misses.ts` (L3573-L3576).

- Ruling: define it once. Core exports `type MissingLookup` with `token: unknown`, since `errors/` imports nothing, and the errors package imports it.

### P42. Environment (not a plan defect)

- The plan's base path (L13) is `/Volumes/...`. The worktree here is `/home/user/core-0.4`.
- At `03f2aca` the worktree has an uncommitted change to `examples/toolchain-matrix/toolchain-matrix.json`. The matrix `--check` compares against the committed file, so decide whether that local diff is expected before relying on the gate.

---

## Checked and clean

- Prose rules: the plan has no em dash, no "native" and no reflect-metadata mention. New message text uses "X, not Y" (L779-L780, L1611), which revision 1 already uses and which is not the banned "not X but Y" form.
- Tool versions and scripts match the repo: TS 6.0.3, Nx 23.1.1, Vitest 4.1.9, esbuild 0.28.2, fallow 3.27.0; `check:type-floor`, `verify:packaging` and `@nexusdi/toolchain-matrix:matrix` exist. `npx nx test core` resolves to `@nexusdi/core`.
- Quoted anchors exist as quoted: `compile.test.ts:76`, `bind.test.ts:133`, `startup.test.ts:226`, `deps.test.ts:185/199/210`, `records.test.ts:700/716`, `r18-cycle-path.test.ts:33`; `CONTRIBUTING.md` "Running `nx g`" and "Package scopes"; the action pins in `ci.yml`; `.nvmrc`.
- Commit scopes: `commitlint.config.js` has `core`, and the scaffold adds each package scope before its first commit.
- Ordering: R10's `recordEvents` precedes R14, R12's object root precedes R13's tests, R19's `exportTokens` precedes R25, and R14's `extend` precedes R20.
