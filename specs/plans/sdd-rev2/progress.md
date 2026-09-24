# SDD ledger — plan: /Volumes/projects/Personal/NexusDI/.claude/worktrees/core-0.4/.superpowers/plans/2026-09-24-core-0.4-revision-2.md

Base: feat/core-0.4 at 03f2aca (engine review-clean). Spec: spec.md (plan/core-0.4-engine b53099e rev2). Owner accepted rev2 + 4 API items (errorBase form, otherCopy boolean, moduleDefinitionOf public, reason ids).

## Environment (cloud session)

Worktree /home/user/core-0.4 (feat/core-0.4). Workspace /home/user/core-0.4/.superpowers/sdd/2026-09-24-core-0.4-revision-2 (excluded via .git/info/exclude); this ledger is symlinked into it. The superpowers skill and scripts are absent here: briefs are extracted from the plan by task heading, review packages are `git diff BASE..HEAD` files, and reviewer-common.md carries its own review method. Baseline gate at 03f2aca verified green after two environment fixes (full history fetched for .git-blame-ignore-revs; Playwright headless shell 1243 path mapped to the installed 1194 build). `npx fallow dupes` exits 0 at baseline with 1.3% duplication. Node is 24.20.0 per .nvmrc (symlinked in /root/.local/bin); Node 22 lacks SuppressedError and fails six core tests.

## Preflight

Scan: preflight.md in the workspace (42 findings, P1-P42). Every ruling below binds its tasks; the finding text in preflight.md gives the details and plan line numbers. Where a ruling says "as recommended", apply preflight.md's recommended ruling for that finding.

Ruling: P1 (Task R1, R5, R7) — the compile() message scenario ignores plugins — write it with Nexus.create(root, { plugins }) in R1, as recommended.
Ruling: P2 (Task R5) — unlisted revision 1 assertions and cause fields — R5 converts records.test.ts :54/:295/:311/:680, the reason sentences in records.test.ts and tier1-prevented.test.ts, scope-context.test.ts:32 and error-cases.ts the two-mode way (assertion values kept in the errors parity suite), and moves `cause` into the options argument in R3 hooks.ts and R4 plugins.ts/nexus.ts.
Ruling: P3 (Task R2, R5, R8, R9, R11, R15) — index.test.ts export list and createRootState options — each task that adds or removes a runtime export updates index.test.ts; the tasks removing overrides/scopeContext update the startup, lazy and init tests.
Ruling: P4 (Task R3) — extra NEXUS_INVALID_EXPORT — change the fixtures so no incidental error arises (keep exact-error assertions); the conflict test uses `{ with }` rewrites.
Ruling: P5 (Task R6) — the first check test forms an import cycle — use a separate Root module importing Engineering.
Ruling: P6 (Task R16) — isForeign flags this copy's own branded values — brand.ts keeps a WeakSet of what this copy branded; foreign means branded and not in it. R1 parity snapshots stay unchanged.
Ruling: P7 (Task R12, R16) — rootModuleOf wraps a foreign value — return foreign-branded values unchanged so compile rejects them.
Ruling: P8 (Task R16) — expected error order — expect [INVALID_PROVIDER, INVALID_MODULE], following walk.ts order.
Ruling: P9 (Task R10) — inspect() async field — inspect() reports async: null for every provider (spec §10.1).
Ruling: P10 (Task R10, R11) — toolchain matrix uses trace, graph() and NexusGraph from core — R10 rewrites run.ts on @nexusdi/devtools, packs the errors and devtools tarballs, and updates golden.json for the eager field; R11 does the same for decorators if run.ts uses them.
Ruling: P11 (Task R13) — missed `.with(` sites — update examples/react-ssr/app/shared/app.module.ts and the OptionsFactory type in scripts/verify-packaging.mjs; grep the whole repo (excluding node_modules, dist, specs) for `.with(` and `with()`.
Ruling: P12 (Task R8, R9, R11) — libs/errors cases for classes leaving core — each task also moves or removes the OverrideError, NoScopeContextError and LegacyDecoratorsError cases, builders and snapshot entries from libs/errors to the owning package (snapshot text unchanged).
Ruling: P13 (Task R8, R10, R11) — security suite — split the core security tests into the packages that own each feature (text and assertions unchanged except imports), SEC-010 moves to devtools and runs on its graph(), and update SECURITY.md and register.test.ts to name each package's security folder.
Ruling: P14 (Task R11) — wrong import paths and missing types — import declareModuleClass from define-module.ts, create the polyfill helper before its test, and export DepsFor, Ctor and Class from core in R11.
Ruling: P15 (Task R11) — declareProperty/declareModuleClass signatures vs spec §3.10.7 — spec binds: `set` becomes optional (3 required args) and declareModuleClass returns the ModuleDefinition.
Ruling: P16 (Task R3) — hook order and pin — spec binds: compile.provider runs before the duplicate check, and pin applies to any token.
Ruling: P17 (Task R6) — check skips load()'s global-module and invalid-module checks — one shared helper used by load and check.
Ruling: P18 (Task R2, R3, R4, R5, all later) — OWNER DECISION: Decision 5's layout vs spec §12.1 — spec binds (least divergent): add the `plugins/` layer to core-layers ALLOWED (`plugins` imports definitions/ and errors/; blueprint may import plugins/views.ts; runtime may import plugins/). Hook and view types from blueprint/views.ts and blueprint/hooks.ts go to plugins/views.ts (compiler-side calling code may stay in blueprint/ importing plugins/views.ts); runtime/plugins.ts becomes plugins/registry.ts; runtime/format.ts becomes plugins/format.ts. Anything that needs the runtime (applyConstruct) stays in runtime/. extend.ts and lazy-build.ts file names stay as the plan has them (cosmetic). An implementer who finds a file that cannot meet these import rules reports NEEDS_CONTEXT.
Ruling: P19 (Task R22) — OWNER DECISION: size.json on main — R22 adds a push-to-main job that writes size.json and uploads it as a workflow artifact; wiring the README figure to it is left to the owner. R23's no-hand-figure test stays.
Ruling: P20 (new Task R21a) — OWNER DECISION: dispatch benchmark (spec §17.3) has no task — spec binds: add Task R21a after R21, briefed by the controller from spec §17.3 and D19.
Ruling: P21 (Task R5, R7) — format.test.ts contract tests — R5 writes the throwing-hook and format-once tests; R7 adds the explain() parity test.
Ruling: P22 (task that implements Decision 9) — OWNER DECISION: one version — spec binds (least divergent): set `"projectsRelationship": "fixed"` in nx.json (tag pattern kept), and rewrite RELEASING.md's subset section to match.
Ruling: P23 (all tasks) — constraint wording — a revision 1 test may change where its task names the change (R5, R8 to R11, R13, and rulings P2, P3, P12, P13); its assertion values stay unchanged or move to the errors parity suite.
Ruling: P24 (Task R8) — testing exports test — move it to libs/testing and add OverrideError to the expected list.
Ruling: P25 (Task R8, R16) — testing's InvalidModuleError — keep revision 1's describeValue locally, and R16 gives that site otherCopy.
Ruling: P26 (Task R7 onward) — cross-package test-support clones — add "**/test-support/**" to duplicates.ignore in .fallowrc.jsonc with a comment; never raise the threshold.
Ruling: P27 (Task R17) — size fixture dependencies — declare the six packages as "*" dependencies of examples/size, as react-ssr does.
Ruling: P28 (Task R14) — extend() rollback errors — record them on root.abortErrors only while the root is disposing, as startBlueprint does.
Ruling: P29 (Task R5) — field order and empty arrays — construct fields in spec §9 table order and pin Object.keys per class.
Ruling: P30 (Task R5) — defineModule "Fix:" spacing — two spaces as revision 1, with a test.
Ruling: P31 (Task R10, R12) — inspect() with errors()/devtools() — skip the built-in formatter when the caller passes it; widen to RootRef in R12.
Ruling: P32 (Task R2) — Review Focus 5 wording — a repeated plugin is named by its name as R2's test and the spec say; indexes name holes and undefined.
Ruling: P33 (Task R3) — test titles and describes — retitle the "complete" test; hook-level describes are allowed as nested describes under the export's describe.
Ruling: P34 (Task R25) — canonicalizer — use a WeakMap and include nexus.ts, load.ts and check in the Files list.
Ruling: P35 (Task R13) — forRootAsync message prefix — keep the "(the forRootAsync() factory)" prefix.
Ruling: P36 (Task R2, R3, R4, R14, R15) — missing spec §17 tests — add the extend() disposal and visibility tests to R14, eager: false via resolve() and onInit to R15, and the plugin order and type tests to R2 to R4.
Ruling: P37 (Task R7 onward) — OWNER DECISION: package tests against the packed tarball — package unit tests keep workspace resolution (entry-only is enforced by the exports map and package-imports.test.ts); each package's verify-packaging consumer checks run against the packed tarballs of core and the package.
Ruling: P38 (Task R10, R11) — CJS consumer — add one require each for devtools and decorators.
Ruling: P39 (Task R10) — R15 split — add R15 to Decision 6; both halves use describe('R15').
Ruling: P40 (scaffold) — procedure order, README timing and bold line — R7 creates package-versions and package-imports checks before step 5 runs them; READMEs arrive in R23 (a package task writes a one-line placeholder README if packaging needs the file); CONTRIBUTING.md scope lines use `- \`<name>\`: ...` without bold, and R7 converts the existing lines in the same list.
Ruling: P41 (Task R7) — MissingLookup — define once in core (token: unknown), exported; the errors package imports it.
Ruling: P42 (all tasks) — environment — the matrix run rewrites examples/toolchain-matrix/toolchain-matrix.json with the local Node version (22.22.2); never commit that change, restore it after each matrix run.

## Tasks
Task R1: dispatched (BASE 03f2aca, sonnet)
Task R1: complete (commits 3de3da3..3de3da3, review clean)
Task R2: dispatched (BASE 3de3da3, opus)
Ruling: R2 split under P18 — accepted — plugins/registry.ts holds a generic PluginSet<Event, Context>, plugins/views.ts the hook and view types; NexusPlugin, PluginContext and RootPlugins stay in runtime/plugins.ts because they name Nexus and TraceEvent. Later briefs map runtime/plugins.ts paths accordingly: registry logic to plugins/registry.ts, runtime-typed parts stay in runtime/plugins.ts.
Ruling: R2 "has a observe hook" article — carried to R5 — R5's one-line message for NEXUS_PLUGIN_INVALID uses correct wording ("an observe hook" or a neutral form) with a test.
Task R2: fix round 1/5 (bad-modules, bad-compile member and missing apiVersion tests; read hooks once)
