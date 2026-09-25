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
Ruling: R2 throwing plugin getter — deferred to R5 — neither spec nor brief defines it; R5 decides whether a throwing hook getter becomes NEXUS_PLUGIN_INVALID.
Task R2: minor (deferred): throwing hook getter escapes create (to R5)
Task R2: complete (commits fc79dd3..9face5b, review clean)
Task R3: dispatched (BASE 9face5b, opus)
Task R3: fix round 1/5 (own-property reads for rewrite fields; load() compile.module tests)
Task R3: minor (deferred): compile.module runs twice per module in load() (by design); later pin wins; shadowed NAMES in a security test; missing blank line in compile-hooks.test.ts
Task R3: complete (commits 1a26084..40bba86, review clean)
Task R4: dispatched (BASE 40bba86, opus)
Ruling: R4 applyConstruct placement — accepted in runtime/build.ts — the brief's runtime/plugins.ts placement forms an import cycle that fallow rejects; pluginContext stays in runtime/plugins.ts.
Ruling: R4 Tracer constructor — accepted widened (Sink[] | Sink | undefined) — keeps revision 1 calls unchanged; R10 narrows it when trace moves to devtools.
Ruling: R4 failed setup marks the container disposing — accepted — a kept container throws NEXUS_DISPOSED, tested.
Ruling: R4 async setup hook — a thenable returned by setup fails create with NEXUS_PLUGIN_FAILED naming the setup hook, as a thenable from construct does, and core attaches a rejection handler so no unhandled rejection escapes — spec types setup as void; this keeps create's failure explicit.
Ruling: (Task R6) Nexus.check passes the plugins' contributed modules (pluginImports) to compile, as create does.
Task R4: fix round 1/5 (adopt the built value before a construct hook failure; ProviderError path; async setup)
Task R4: minor (deferred): M2 failed setup does not await in-flight load/createScope rollbacks; M6 retries of a failing scoped construct hook hold instances until scope disposal
Task R4: complete (commits 8646107..b95802a, review clean)
Task R5: dispatched (BASE b95802a, opus)
Ruling: R5 one-line message omits empty arrays — accepted — spec §9's example and the brief's exact line both drop an empty nearMisses.
Ruling: R5 new reason ids 'bad-description' (InvalidTokenReason) and 'getter-throws' (PluginInvalidReason) — accepted — additions only; a throwing plugin getter is NEXUS_PLUGIN_INVALID naming plugin and key.
Ruling: R5 formatter split — accepted — formatThrown and layout in plugins/format.ts; guard, guardAsync and formatFor in runtime/guard.ts because they need runtime state.
Ruling: (Task R7) the InvalidProviderError error case's cast reason — R7 replaces it with a real InvalidProviderReason id while the parity suite keeps revision 1's text.
Task R5: fix round 1/5 (malformed ErrorText loses the error; asyncDispose promise identity with a formatter)
Ruling: R5 coverage command — the Step 9 coverage run includes src/text/reasons.test.ts with messages.test.ts (documented in text/reasons.test.ts).
Task R5: minor (deferred): NearMiss entry shapes unchecked; a NexusError rethrown from another container can be formatted again (revision 1 behaviour); dupes 1.4%
Task R5: complete (commits 68948ec..d4f09c5, review clean)
Task R6: dispatched (BASE d4f09c5, opus)
Ruling: R6 load admission errors in check — spec §3.5 binds ("throws one BlueprintError otherwise"): check wraps NEXUS_INVALID_MODULE and NEXUS_LOAD_GLOBAL_MODULE from options.load in one BlueprintError (as inner errors); plugin validation errors stay direct, as at create.
Ruling: R6 a load module the root already imports — accepted skipped, as load() does.
Task R6: fix round 1/5 (wrap load admission errors in one BlueprintError)
Task R6: complete (commits 5c79dea..5e66b58, review clean)
Task R7: dispatched (BASE 5e66b58, opus)
Ruling: R7 InvalidProviderError parity case — accepted — the R1 line came from a cast fixture reason, not real revision 1 output; the case now uses 'not-a-provider' with ['null'] (revision 1's real text for a null provider), and a dedicated parity test still asserts the old R1 line character for character through the unknown-reason fallback.
Ruling: R7 explain() lookup optional, BlueprintError aggregate text, core error-cases one per code, describeThrown copied (dupes 1.5%, under threshold) — accepted.
Ruling: R7 release tag under "fixed" — OWNER DECISION — nx fixed releases make one tag and never fill {projectName}. Least divergent: pattern "@nexusdi/core@{version}", which keeps the existing tag history (@nexusdi/core@0.3.2 resolves as the current version) and names one tag per shared release; verify with an nx release dry run; RELEASING.md says one tag per release.
Task R7: fix round 1/5 (release tag pattern; small minors)
Task R7: minor (deferred): core keeps a full copy of message-scenarios.ts; no explicit empty dependencies field (matches scaffold); unreachable near-miss branches kept for parity
Task R7: complete (commits 2f404ba..7a49b2a, review clean)
Task R8: dispatched (BASE 7a49b2a, opus)
Ruling: R8 compile.check report type widened to NexusError<string> — accepted — spec §9 types a plugin's code as string.
Ruling: R8 override errors reported from compile.check after core's passes — accepted — every revision 1 test passes; README doctests point at @nexusdi/testing until R23.
Task R8: fix round 1/5 (stale usedModules after a no-op load reports a false NEXUS_OVERRIDE_EXPORTS)
Task R8: fix round 2/5 (stale override entry when one stub replaces two modules)
Task R8: minor (deferred): M5 module-export comparison after replacement; M6 Blueprint.exportedTokens has no reader (R19); M7 distinct CompileContext per compile unpinned (carried to R9)
Task R8: complete (commits 77eceda..b330351, review clean)
Task R9: dispatched (BASE b330351, sonnet)
Ruling: R9 NoScopeContextError — moves to libs/node/test-support (never ships; spec §9 retires the code unused); its parity test keeps revision 1's text.
Task R9: fix round 1/5 (port gated concurrency, per-call storage, macrotask crossing and export-list tests; NoScopeContextError to test-support)
Note: blueprint/levels.test.ts stack-depth test flaked once under nx during R9 (passed on retry); investigate in the final review.
Task R9: minor (deferred): core README documents @nexusdi/node (R23); nodeViolations mixes path conventions
Task R9: complete (commits 1cebc8b..fcfc1db, review clean)
Task R10: dispatched (BASE fcfc1db, opus)
Ruling: R10 devtools vite.config importing ../core/vite.decorators.ts with an eslint-disable and a spec tsconfig reference — accepted for now; (Task R11) R11 points it at libs/decorators and removes the cross-project reach if possible.
Ruling: R10 DevtoolsError wording written by the implementer (spec §9 gives none) — accepted, subject to the prose rules.
Ruling: R10 inspect() puts the caller's plugins before its own — accepted — plugins[i] in NEXUS_PLUGIN_INVALID then matches the caller's array index.
Task R10: fix round 1/5 (inspect() reads plugins before validation)
Task R10: minor (deferred): packed-list shape duplication (dupes 1.8%); cosmetic M6; (Task R15) add a real eager: false graph assertion
Task R10: complete (commits 3267aae..322a531, review clean)
Task R11: dispatched (BASE 322a531, opus)
Ruling: R11 R20 split between core and decorators (both describe('R20')) — accepted, as P39 did for R15; the decorators package gains a Chromium config and test-browser target for it.
Ruling: R11 no separate pickOwnDeps helper — accepted when declareClass reads own keys only (reviewer verifies).
Ruling: R11 R10 regression reads metadata through a test-only helper on core's Symbol.for keys; devtools' vite config reaches libs/decorators/vite.decorators.ts with an eslint-disable (typescript cannot ship in the published entry); decorator-syntax security tests moved to libs/decorators, direct metadata-function tests stay in core; core README decorators doctest moved to libs/decorators/README.md with a pointer — accepted.
Task R11: fix round 1/5 (LegacyDecoratorsError instanceof assertions; declareClass own-key test)
Task R11: fix round 2/5 (default setter: defineProperty only for '__proto__')
Task R11: minor (deferred): M1 frozen parent metadata throws on write (revision 1 behaviour); M3 core README line (R23)
Task R11: complete (commits 9012aca..8f5952c, review clean)
Task R12: dispatched (BASE 8f5952c, opus)
Ruling: R12 RootRef<P, Q> with a ProviderEntry[] default, the corrected MISSING_DEPS type-test premise (spec §3.2), and NEXUS_INVALID_MODULE for a non-array providers/imports/exports in a root object — accepted.
Ruling: R12 root object with an extra key at create — create rejects with one BlueprintError wrapping NEXUS_INVALID_MODULE, as create(3) and check already do (spec §9 does not list create as a bare raiser); the brief's bare-error test changes to match.
Task R12: fix round 1/5 (undefined keys absent; consistent BlueprintError at create; comment wording)
Task R12: minor (deferred): stale asBlueprintError comment at nexus.ts:166 (carried to R13); extra-key error names no key (needs a spec §9 field; owner item); missing-provider text 'in a module root imports'
Task R12: complete (commits 4b46fba..13f897f, review clean)
Task R13: dispatched (BASE 13f897f, opus)
Task R13: container restarted mid-task; implementer lost; uncommitted partial work kept in the worktree; re-dispatched (BASE 13f897f, opus) to continue from it
Task R13: fix round 1/5 (Module.with comments in five package eslint configs; SEC-002 inherited deps)
Task R13: minor (deferred): deps: null treated as no deps (brief behaviour); verify-packaging type-list order
Task R13: complete (commits 217f16b..b795a64, review clean)
Task R14: dispatched (BASE b795a64, opus)
Ruling: R14 NEXUS_LOADED_AFTER_SCOPE fix line — accepted — revision 1's "Fix: create a new scope." becomes the brief's "call await scope.extend() after load(), or create a new scope." (spec D10); only the two LoadedAfterScopeError snapshot entries change, on that line.
Ruling: R14 rollback errors when the scope itself is disposed mid-extend — accepted per preflight P28: extend() rejects NEXUS_DISPOSED, rollback errors surface in the scope's asyncDispose rejection (ScopeState.abortErrors), and go on root.abortErrors only while the root is disposing.
Task R14: fix round 1/5 (rollback disposes concurrent get() instances and on-demand old-pin builds; pendingExtend cleared late)
Task R14: fix round 2/5 (transients injected into a kept old-pin scoped class are rolled back)
Task R14: minor (deferred): a transient factory returning one object shared by a new provider and a kept scoped class is owned by the first adopter (spec §8.2 ownership); a new scoped class reached only through a lazy thunk after an await is disposed by the scope later instead of the rollback
Task R14: complete (commits f6e01d9..6ba0eea, review clean)
Task R15: dispatched (BASE 6ba0eea, opus)
Ruling: R15 create/load rollback limited to what its own build steps adopted (shared with extend()'s bookkeeping) and extend() clearing every slot the pinned blueprint lacks — accepted as needed for eager: false correctness; the reviewer verifies no revision 1 behaviour changed.
Ruling: R15 onInit order for an eager: false singleton built during create/load — OWNER DECISION (spec §6.6 vs §8.1 conflict) — least divergent: while create or load runs, such a singleton's onInit joins its level's onInit step and runs after its dependencies' onInit, like an eager provider built at that level; at get() time outside a run, onInit runs right after the build (§6.6). No user can then observe an uninitialised dependency.
Task R15: fix round 1/5 (dispose lazily built singletons on a failed create/load; onInit order during a run)
Task R15: minor (deferred): aborted createScope rejects PROVIDER_FAILED in one edge case (user-thrown DisposedError); failed on-demand builds stay in root.owned; M4 a rollback disposer calling a thunk to a never-built eager: false singleton builds and leaks it (carried to R16)
Task R15: complete (commits da33e6e..5144eff, review clean)
Task R16: dispatched (BASE 5144eff, opus)
Ruling: R16 testing's InvalidModuleError site passes otherCopy: false — accepted — a real value would need core's internal isForeign, which the spec does not make public; recorded as a known limit.
Ruling: R16 nexus-error.test.ts KEYS table gains 'otherCopy' for the three classes that add the field — accepted (new field, P23).
Ruling: R16 foreign @Module classes — declareModuleClass brands the class when it is extensible, so a second copy's @Module class gets otherCopy true (users first; C3's intent covers module references).
Ruling: R16 core's one-line message does not show otherCopy — OWNER ITEM, deferred; @nexusdi/errors names the second copy.
Task R16: fix round 1/5 (lazy thunk after a failed run builds into an uncommitted id; brand @Module classes)
Task R16: minor (deferred): modifier results (lazy/optional/all) carry no brand (spec does not require it); core one-line message does not show otherCopy (owner item)
Task R16: complete (commits 62c870b..c297a63, review clean)
Task R17: dispatched (BASE c297a63, sonnet)
Ruling: R17 size fixtures duplicate each other by design (dupes 1.7% -> 2.2%) — (Task R18) add "examples/size/src/**" to duplicates.ignore in .fallowrc.jsonc with a comment, as P26 did for test-support; never raise the threshold.
Task R17: minor (deferred): report misstated the dupes figure
Task R17: complete (commits aa88c6b..aa88c6b, review clean)
Task R18: dispatched (BASE aa88c6b, opus)
Task R18: minor (deferred): stale 'Today's figure is 2.5%' comment in .fallowrc.jsonc (fix when next touched)
Task R18: complete (commits 4861d07..143cb3f, review clean; rule table measured +96 bytes, reverted, recorded kept: false)
Task R19: dispatched (BASE 143cb3f, opus)
Ruling: R19 size-report.mjs compares a step with the last kept record — accepted (a reverted step's size must not be the baseline).
Ruling: R19 export errors pushed after dropDuplicates — accepted, keeps error order identical.
Note: during R19 a cached run failed devtools:test and testing:test once and passed unchanged on rerun; investigate in the final review together with the levels.test.ts flake.
Note: the flake is a dist race: a package's test-d typecheck reads another package's dist while it is being rebuilt ('libs/testing/dist/index.d.ts has not been built from source'); fix in the final wave (test targets depend on the built dist, or typecheck resolves source).
Task R19: fix round 1/5 (compile.module hook timing for export-only modules)
Task R19: complete (commits 26d357f..a789f0d, review clean; core 18135 -> 18121, kept)
Task R20: dispatched (BASE a789f0d, opus)
Ruling: R20 createScope pin test (eager: false-only scoped level, dispose in the same turn rejects NEXUS_DISPOSED without calling the factory) — land it on its own as a test(core) commit; it pins existing behaviour.
Task R20: complete (commits 4c92367..c1e30cc, review clean; level builder measured +16 bytes, reverted, recorded kept: false; pin test landed)
Task R21: dispatched (BASE c1e30cc, opus)
Task R21: complete (commits 850f7db..850f7db, review clean; one store path measured +33 bytes, reverted, recorded kept: false)
Task R21a: dispatched (BASE 850f7db, opus)
Ruling: R21a benchmark finds get() 5-12% slower with hook sites — spec D19/§17.3 bind ("no measurable cost" is a test): fix core, never weaken the benchmark. With no plugin registered each get() site must cost at most a length test: no event closure allocation without an observer, no clock read without an observer, guard/formatError wrapping skipped when no formatError hook, construct site a length test. Measure size before and after (report both); record a consolidation.json step if core's size changes.
Task R21a: fix round 1/5 (make hook sites free with no plugin so the benchmark passes)
Ruling: R21a hook removal lives in the benchmark's own bundling step with a byte-identity check of the hooks-on bundle against the shipped code — accepted (meets §17.3; the shipped source keeps no build constant).
Task R21a: minor (deferred): noise bound is the max of 14 A/A gaps (createScope bound 20-45%); bench job not yet seen on a GitHub runner; two comment nits
Task R21a: complete (commits bb294d4..434a628, review clean; core 18121 -> 18227 recorded)
Task R22: dispatched (BASE 434a628, sonnet)
Ruling: R22 base that cannot be measured (e.g. the first 0.4 PR against 0.3 main, whose core lacks defineModule) — the report shows head sizes only with a line saying the base could not be built, and the growth check passes; tested. Spec §12.4 measures head and merge base; this covers the case where the base fixture cannot build.
Task R22: fix round 1/5 (unmeasurable base; measure the PR head and its merge base; concurrency; minors)
Task R22: fix round 2/5 (fallback only when the base has no size fixture; Dependabot comment 403; prose dashes)
Task R22: complete (commits 799e367..8cf7c2c, review clean; workflows not yet run on a GitHub runner)
Task R23: dispatched (BASE 8cf7c2c, opus)
Ruling: R23 interface-first startup-cost example, 'built on core's public API' table wording, reflect-metadata left out of the root README (owner rule beats §14.1's list) — accepted.
Ruling: (Task R24) add a gate that typechecks README doctest blocks (R23 found one that ran but failed tsc).
Ruling: §14.1 guides (API/worker/CLI, multi-team shell) and the 0.3 migration pointer (§13.1, codemod) belong to the docs and codemod plans (Decision 14); recorded as out of this plan's scope.
Task R23: fix round 1/5 (errors README typecheck; interface-first ShipComputer; decorators are not plugins)
Task R23: minor (deferred): Minors 4-7 (wording and naming nits in README examples)
Task R23: complete (commits 69234d3..788daf3, review clean)
Task R24: dispatched (BASE 788daf3, opus)
Task R24: fix round 1/5 (core and decorators test.dependsOn override the new default; README gate comment)
Task R24: complete (commits 8beb213..e2586a0, review clean; gate green, spec checklist in task-R24-report.md)
Task R25: dispatched (BASE e2586a0, opus)
Ruling: R25 deps keyed in bind with optional Edge.token and RootInit.canon (keeps revision 1 toEqual tests), Blueprint.key for view.visible(), bench sites updated — accepted pending review.
Ruling: R25 a tokenKey result that maps tokens of different kinds (Token, MultiToken, class) to one key — reported as NEXUS_PLUGIN_FAILED naming the plugin and hook 'tokenKey', independent of order; same-kind tokens on one key collide as two providers of one token would (spec §3.10.3).
Task R25: fix round 1/5 (mixed-kind keys; ambiguity-on-keys test)
Note: core is 18645 after R25 (+2.29% over R21a's 18227, above coreGrowthPercent 2); the PR carrying revision 2 needs a `## Size` section (owner item; feature growth is reported, never reverted).
Note: the dispatch benchmark sits near its noise edge even at BASE e2586a0 (createScope 50 failed once there; get scenarios fail about one short run in three); final wave: make the default run robust (more blocks or a sturdier noise estimate) without loosening the rule.
Task R25: minor (deferred): a dependency on a token that failed the kind check also reports NEXUS_MISSING_PROVIDER; byKey holds keys strongly (documented)
Task R25: complete (commits 21c5c53..ce4bd60, review clean; core 18645)
Task R26: dispatched (BASE ce4bd60, opus)
Ruling: R26 federation caches and keys contracts by kind and name (a token and a multi of one name never share a key, avoiding R25's mixed-kind error); README package lists gain federation — accepted.
Ruling: R26 ProviderView.token must be the token the provider wrote (spec §3.10 "the user's own objects"), not the first token met for its key; core keeps the written token on the provider record (R25 surface) and federation reads it.
Ruling: R26 invalid contract version — defineContract rejects a version that is not MAJOR.MINOR.PATCH digits with a TypeError naming the value (programmer error at definition time; the spec has no code for it). Recorded as an owner item in case a Nexus code is wanted.
Task R26: fix round 1/5 (provider view token; version validation; key separators; wording)
Note: R26 contract versions accept digits-only MAJOR.MINOR.PATCH; prerelease versions such as 2.3.0-rc.1 are rejected (owner item if RC contract versions should work).
Task R26: complete (commits cb1cebd..bf3df20, review clean; core 18671)
Final review: dispatched (range 03f2aca..bf3df20, opus)
Final review: done (final-review.md: 1 Critical, 4 Important, 24 Minor, 10 owner decisions; every gate green).
Ruling: FR-C1 fix — errors raised by core are formatted by formatError hooks wherever they surface, including a ProviderError's cause and alsoFailed, with parity scenarios for create, createScope, load, extend and a construct hook.
Ruling: FR-I2 two plugins pinning one token — follow spec §3.10.3 exactly; if the spec names a conflict code, raise it; if it is silent, keep last-wins, document it, and record it as an owner item.
Ruling: FR-I3 benchmark — calibrate an inner repeat count so each sample runs about 10 ms, add a stats test with a synthetic 5% slowdown that must fail, keep the rule (median slower by more than measured noise fails); no loosening.
Ruling: FR-I4 OWNER DECISION (spec silent) — least divergent and users first: when a later plugin's setup fails, core calls the dispose hooks of the plugins whose setup completed, in reverse order, and reports their errors with the setup failure; recorded for the owner.
Ruling: FR-I1 core size (+16% over revision 1, D5 estimated 13.5-14.5 KB) — OWNER DECISION; the fix wave adds a "revision 1 (03f2aca)" baseline record to consolidation.json marked as a baseline without changing later deltas' meaning, if the script allows it cleanly; otherwise it is documented.
Final fix wave: dispatched (BASE bf3df20, opus)
