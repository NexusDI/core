# Scoped re-review after the final fix wave: NexusDI core 0.4 revision 2

Range bf3df20..09704e8 (12 commits, 27 files). Checkout at 09704e8. The workspace `final-fix.diff` matches `git diff bf3df20..09704e8` byte for byte. Reviewer: read-only; the checkout was left clean and the scratch worktree of 03f2aca was removed.

Verdict: needs one small fix. C1, I1, I2 and I3 are resolved as their rulings say. I4 is resolved as ruled, but its new close path lets a container that a setup hook kept run the plugin dispose hooks a second time (Important, one-line fix). Four Minor items. Every gate is green except the benchmark, whose red runs are the recorded owner item.

## Gate results

| Gate | Result |
| --- | --- |
| `rm -rf libs/*/dist && npx nx run-many -t lint test build typecheck --skip-nx-cache` | pass, 14 projects, 1,677 tests (core 905, errors 225, repo-checks 250) |
| `npm run verify:packaging` (dist deleted) | pass, "Packaging verified." |
| `npx prettier --check .` | 81 files warn, every one under `.superpowers/` |
| `npx fallow dead-code --fail-on-issues` | no issues |
| `npx fallow dupes` | exit 0, 1.6% (threshold 2.0) |
| `npm run check:type-floor` | pass (TS 5.4, TS 7) |
| `npm run size` (dist deleted) | core 18,866; decorators 1,249, devtools 4,695, errors 4,388, federation 450, node 84, testing 1,123 (matches the report and consolidation.json) |
| `npx commitlint --from bf3df20 --to 09704e8` | pass; all 12 commits carry both trailer lines |
| `npx nx run @nexusdi/core:bench`, run 1 | pass (k 1 to 10; slowdowns -0.8% to +11.0%, noise 3.2% to 12.9%; get 2000 +11.0% against 12.9%) |
| `npx nx run @nexusdi/core:bench`, run 2 | FAIL on get 2000 (+7.6% against 6.9% noise); every other scenario passes (slowdowns -0.1% to +4.7%) |

## Critical and Important findings from final-review.md

### C1: resolved

- `plugins/format.ts` keeps a `RAISED` WeakMap from an error to the `plugins` object of the container that raised it. `formatThrown` formats a ProviderError's `cause` and each `alsoFailed[i].cause` whose entry is this container's plugins, with the same view, before the ProviderError itself. `settle.ts`'s `failureOf` unwraps a nested ProviderError to its cause, so a construct-hook failure on an on-demand dep (a ProviderError inside a ProviderError) reaches the map too.
- Throw sites marked: `asyncBuildError` (AsyncTransient and LazyAsync, including `init.ts`), `notBuilt`, `buildOnDemand`'s NotReady and DisposedErrors, both ScopeRequired sites, `constructFailed`, and `validateOptions`. The remaining NexusErrors in `scope.ts`, `load.ts` and `lazy.ts` surface at the operation boundary or through a thunk's `guard`, which already formats them. All marks are on failure paths.
- Reproduction rerun. I rebuilt the reviewer's scenario as a probe and ran it against a revision 1 bundle built with esbuild from 03f2aca's `libs/core/src` (no plugin) and against the head dist with `errors()`. For create with an async transient dep, the same with a second failure in `alsoFailed`, createScope, load, and a factory rethrowing another container's error, the two outputs are identical character for character (`diff` empty). Head-only scenarios with `errors()`: extend() gives the same AsyncTransient text; a construct hook that throws gives `... failed: PluginError: [NEXUS_PLUGIN_FAILED] the construct hook of c failed: Error: wrap failed`, also when the failing provider is an `eager: false` dep of an eager one (`While building: M → K`); NEXUS_LAZY_ASYNC as a dep at create gives its full text.
- Tests: ten parity scenarios in `libs/errors/src/parity/operations.test.ts` (create, alsoFailed, createScope, load, extend, NEXUS_INVALID_MODULE_OPTIONS, NEXUS_LAZY_ASYNC, the construct hook at create and at get(), and the other-container rethrow that stays one line) plus a core unit test in `plugins/format.test.ts`. The RED evidence (`ffw-evidence/c1-red.txt`) shows 9 of the 10 fail at the pre-fix code, the tenth being the negative case, so the suite would catch a regression.
- The per-container key keeps §9.1's "never formats a value user code threw". The §9.1 example wording is the recorded owner item.

### I1: resolved

- `examples/size/consolidation.json` gains a first record `revision 1 (03f2aca)`, 16,050 B, delta 0, `baseline: true`, and the existing "revision 2 features (R1 to R16)" record gains `baseline: true` with its numbers unchanged. I rebuilt 03f2aca's core dist with `tsc -p tsconfig.lib.json` and bundled the size fixture with the script's settings (esbuild minify, ESM, platform node, es2022, gzip 9): 16,050 B, the recorded figure. The reviewer's 16,082 B bundled source, which explains the 32 B gap.
- Later deltas are unchanged. `size-report.mjs --record` still compares with the last kept record (`findLast(kept)`), which is never the revision 1 record once a later record exists, and no other code reads the file. The R19 delta (-14 from 18,135) and every later one read as before. The `baseline` flag marks the two chain starts; the only cost is that a reader must know delta 0 on the second record is not 18,135 - 16,050. The `size-report.mjs` comment says so.
- The draft `## Size` section in the report is sound and stays with the owner (decision 1).

### I2: resolved as ruled

- Spec §3.10.3 says `pin` removes every other provider of the token; the conflict rule for `compile.provider` is the §3.10.2 order table ("as `compile.module`, per provider"), which covers two rewrites of one provider. The spec names nothing for two pins of different providers of one token, so the ruling's "silent: keep last-wins, document, owner item" applies.
- `blueprint/hooks.ts` doc comment and a core README paragraph state the rule; `compile-hooks.test.ts` pins it in both plugin orders. The test records existing behaviour, which is what the ruling asks. The owner item is recorded in progress.md.

### I3: resolved; rule not loosened

- `dispatch.mjs`: every operation takes `reps` and returns the time of one repetition (one create, 10,000 gets, 1,000 createScopes), with disposal outside the timed part. Warm-up rounds at one repetition give a first `k`; block -1 runs at that `k`, re-measures warm code, sets the final `k` (about 10 ms per sample, at most 1,000) and the round count, and is dropped. All four copies share one `k` per scenario, so the effect and the A/A gaps are measured like for like. `k` is printed per row.
- `stats.mjs` is unchanged: 7 blocks, median of block slowdowns, max of the 14 A/A gaps, fail when effect exceeds noise. The optional rerun-on-fail was not added, which is correct under "no loosening".
- The stats test (`tools/repo-checks/src/dispatch-bench.test.ts`) uses seeded mulberry32 and Box-Muller, 7 blocks of 15 samples per copy, 1% jitter, 20 seeds: 5% must fail and 0% must pass. It is deterministic. `ffw-evidence/i3-loosened-red.txt` shows a `4 * max` estimator fails it.
- The benchmark now fails some runs on a get scenario. The fix report's A/A control and bf3df20 comparison show the calibration exposed an existing cost; it did not add one. This is the recorded owner item.

### I4: resolved as ruled, with one new Important defect

- `nexus.ts` `closeFailed`: marks the root disposing, awaits `state.inflight` (Minor 24), disposes `state.owned` in reverse, then runs the dispose hook of each plugin whose setup completed, in reverse plugin order. `disposalErrors` holds `abortErrors`, then instance errors, then hook errors, the order `disposeRoot` uses. `root.scopes` is empty at this point (setup hooks are synchronous, and a scope that finishes during the await is rolled back because `disposing` is set), so skipping the scope loop is safe.
- Tests in `runtime-hooks.test.ts` cover order (a plugin without setup, the failing plugin and later plugins are skipped), thrown and rejected dispose errors in reverse order, and a createScope a failed setup started. All three fail at the pre-fix code (`ffw-evidence/i4-red.txt`).

#### New Important N1: a container a setup hook kept runs the dispose hooks again when disposed

- Where: `libs/core/src/runtime/nexus.ts:316-339` (`closeFailed`) with `libs/core/src/runtime/shutdown.ts:19-20` (`root.disposal ??=`).
- Evidence (probe against the head dist): plugin `a` keeps `context.container` in `setup`, plugin `b`'s setup throws. `create` rejects with NEXUS_PLUGIN_FAILED after `a dispose`. Then `await kept[Symbol.asyncDispose]()` resolves and logs `b dispose`, `a dispose`. Log: `a setup, a dispose, NEXUS_PLUGIN_FAILED, b dispose, a dispose, kept disposed`.
- Why it matters: `closeFailed` never sets `root.disposal`, so `disposeRoot` starts a full disposal and calls every plugin's dispose hook. Plugin `a` releases its resources twice, and `b` gets a dispose for a setup that failed, the case the ruling excludes. At bf3df20 `a` saw one dispose on this path; the fix wave made it two. The old comment ("The hook may have kept the container") shows the kept-container case is expected.
- Fix: make the failed close the container's disposal, for example `const closing = closeFailed(state, setUp); state.disposal = closing.then(() => undefined, () => undefined);` and throw with `disposalErrors: await closing`, so a later `asyncDispose()` returns the settled close and runs no hook again. Add a `runtime-hooks.test.ts` case: a setup hook keeps `context.container`, a later setup throws, then `asyncDispose()` on the kept container resolves and the log gains no dispose entry.

## Minors

Taken, checked:
- 1 `.fallowrc.jsonc`: "Today's figure is 1.6%", threshold 2.0; dupes exit 0 at 1.6%. The antithesis in that comment and in the size-report entry is gone.
- 2 `"dependencies": {}` on the five optional packages; the new repo check fails without it (`m2-red.txt`) and asserts devtools' `{ "@nexusdi/errors": <version> }`.
- 14 `extend()` NEXUS_DISPOSED once the root disposes, in `extend.test.ts`, both while closing and after; the revision 1 R17 file is untouched.
- 15 RELEASING.md em dash gone. 16 antithesis comments rewritten in `size-report.yml`, `.fallowrc.jsonc` and `lazy.ts`. 18 `size-compare.mjs` writes `n/a`.
- 24 fixed within I4.

Not taken: the reasons for 3, 4, 5, 6, 7, 8, 9, 10, 13, 20, 22 and 23 hold (spec scope, revision 1 test protection, or owner calls already listed). "The spec does not require it" is a thin reason for 11, 12 and 21 (documentation and a type-test tightening) but consistent with the no-scope-creep rule; they can wait for after rc.0. Minor 17 is the exception below.

New Minors:
- M1. `libs/core/src/blueprint/hooks.ts:267-268` and the comment in the new `compile-hooks.test.ts` case say "Spec §3.10.3 names NEXUS_PLUGIN_CONFLICT for two rewrites of one record". The conflict rule is in §3.10.2's order table; §3.10.3 does not name the code. Fix: cite §3.10.2.
- M2. Minor 17 (`persist-credentials: false` on the bench job's checkout in `.github/workflows/ci.yml`) was declined as hygiene only. It is a one-line credential-exposure hardening that the size workflow already applies. Fix: add it.
- M3. The synthetic stats test catches a large loosening (`4 * max`) but a 5% effect against about 1% noise leaves room for a 2x or 3x loosening to pass. Optional: add a 3% slowdown case with the same seeds that must fail.
- M4. `closeFailed` emits no `dispose` trace event, where `disposeRoot` does. It predates this wave (the old setup-failure path did not emit one either). Fix if N1 is fixed by routing through a shared close: emit the event there too.

## Regressions

- No existing test line changed: `git diff bf3df20..09704e8 -- '*.test.ts' '*.test-d.ts'` has no removed lines; every change is a new `it` block, a new `describe`, or a new import.
- Hot path: every `raised` call is on a throw path, and `closeFailed` sits behind the `plugins.setup.length === 0` return, which the bench's bare build strips with that site.

## Prose

Added comments and docs follow the rules: no em dashes, no bold lead-ins, no "native", no reflect-metadata, no "not X but Y" in the lines this wave wrote. The one factual slip is the §3.10.3 citation (M1).

## Owner items

None new. The recorded ones stand: benchmark get() cost (fails some runs), §9.1 example wording, two pins from different plugins, dispose after a failed setup, core size and the `## Size` section.

## Re-check after fix round 1 (09704e8..0a8d77e)

Four commits (829eb0a, cda23ac, 3d298c0, 0a8d77e); `final-fix2.diff` matches `git diff 09704e8..0a8d77e`. Verdict: ready for the owner. N1, M1, M2 and M4 are fixed; no new Critical, Important or Minor finding.

- N1: `closeFailed` now sets `state.disposal` synchronously to a promise that never rejects (its errors reach the caller only in the PluginError's `disposalErrors`), so `disposeRoot`'s `root.disposal ??=` returns it. My probe from the re-review now logs `a setup, a dispose, NEXUS_PLUGIN_FAILED, kept disposed`: no second `a dispose`, and no `b dispose`. Two later `asyncDispose()` calls return the same promise. When a setup hook disposes the container it kept and then throws, `closeFailed` waits for that disposal and returns its error; that path is a full `disposeRoot`, so it also runs the failing plugin's and setup-less plugins' dispose hooks. That is consistent: the plugin itself asked for full disposal. The new test fails at 09704e8 (`ffw-evidence/n1-red.txt`).
- M4, dispose event (§8.2, §10.2): the close emits `dispose` with `disposed`, `errors` and `durationMs` (the §10.2 shape) after the `dispose:instance` events and before the dispose hooks, the §8.2 step 4, 5, 6 order. A throwing observer joins the errors through `collectInto`, as in `disposeRoot`. Probe with an observer plugin: `D disposed, dispose:instance, dispose 1/0, a dispose`. Step 3 (open scopes) has nothing to do here: setup is synchronous, and a scope a setup hook starts is in `inflight` and rolls back because `disposing` is set. `bench/sites.mjs` counts 12 `emit(` and 12 `now()` sites, and the bench's byte-identity check passes within the core test and build run.
- M1: `hooks.ts` and the `compile-hooks.test.ts` comment now cite the §3.10.2 order table. The comment move is the only removed test line in the round.
- M2: the bench job's checkout sets `persist-credentials: false`.
- Gates at 0a8d77e: `nx run-many -t lint test build typecheck --skip-nx-cache` with dist deleted, all 14 projects: pass (core 907, errors 225, devtools 46, repo-checks 250). `verify:packaging` (dist deleted): pass. prettier: only `.superpowers/` files warn. commitlint 09704e8..0a8d77e: pass. consolidation.json records 18,917 B (+51). No prose-rule violations in the added lines.
- Owner items added: none.
