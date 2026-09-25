# Final fix wave report: NexusDI core 0.4 revision 2

BASE bf3df20, HEAD 09704e8, branch feat/core-0.4. Node 24.20.0, `NX_DAEMON=false NX_NO_CLOUD=true`.
Evidence files: `ffw-evidence/` in this directory.

Status: DONE_WITH_CONCERNS. The one concern is the benchmark. Once each sample runs for about 10 ms, the benchmark shows a get() slowdown that fails 3 of 5 runs. The same thing happens on bf3df20's source, so this wave did not cause it (see FR-I3).

## Commits

| SHA | Subject |
| --- | --- |
| c8bea31 | fix(core): format the errors core raises inside a failed build |
| 856bafd | docs(core): state which pin stays when two plugins pin one token |
| ce2385d | test(core): time each benchmark sample over about 10 ms |
| 0075248 | fix(core): release the plugins already set up when a later setup fails |
| c91103b | chore(repo): record revision 1's core size as a baseline |
| 6f33e38 | chore(repo): state today's duplication figure and lower the ratchet |
| ce00729 | docs(repo): state positive facts and drop em dashes in the size tooling |
| f743156 | docs(core): state where a lazy thunk's owner comes from |
| c13da3b | chore(repo): give each optional package the empty dependencies spec §12.2 shows |
| 6037de9 | test(core): check that extend() rejects once the root disposes |
| a845615 | chore(repo): record the final fix wave's core size |
| 09704e8 | docs(core): reflow the comment on formatting a thrown error |

Every commit passed the commitlint hook (`npx commitlint --from bf3df20` exit 0) and ends with the two trailer lines. No existing test was changed or loosened. The only changes to existing test files are new `it` blocks.

## 1. FR-C1 (Critical): errors core raises get formatted wherever they surface

What changed:
- `libs/core/src/plugins/format.ts` has a module-level `RAISED` WeakMap from an error to the `plugins` object of the container that raised it, and the helper `raised(plugins, error)`. Before `formatThrown` formats a `ProviderError`, it formats `cause` and each `alsoFailed[i].cause` whose `RAISED` entry is this container's plugins. They use the same view, so the ProviderError's line quotes their new text. The map is keyed per container, so two kinds of error stay unformatted: a value user code threw, and a NexusError another container raised that user code rethrew. That keeps spec §9.1's "never formats a value user code threw".
- Throw sites marked with `raised` (all on failure paths):
  - `build.ts`: `asyncBuildError` (AsyncTransientError, and LazyAsyncError in `initOnDemand`, `buildOnDemand` and `init.ts`), `notBuilt`, `buildOnDemand`'s NotReady and its two DisposedErrors, `requestOf` and `resolveScoped`'s ScopeRequiredError, and `constructFailed`'s PluginError.
  - `startup.ts`: `validateOptions`' ModuleOptionsError.
  - `lazy.ts` needs no mark, because a thunk call runs through `guard`, which already formats its error.
- Core unit test (`plugins/format.test.ts`): an async transient's cause is formatted before the ProviderError, with the same view.

Parity scenarios (`libs/errors/src/parity/operations.test.ts`, describe "errors core raises inside a failed build"). I checked each expected text against a revision 1 bundle built from 03f2aca in a scratch worktree, using `probe.mjs` and `probe2.mjs` scripts. Revision 1's output matched the literals character for character.
- create, async transient dep: revision 1 text.
- the same level's `alsoFailed` cause: revision 1 text, and the "Also failed in the same level" line.
- createScope, async transient under a scoped factory: revision 1 text.
- load, async transient: revision 1 text.
- extend(), async transient under a newly loaded scoped factory: revision 2 only. The text follows the same builder.
- NEXUS_INVALID_MODULE_OPTIONS at create: revision 1 wrote `Comms.with()`. D4 names the module, so it is `Comms received options its schema rejects:` plus the issue line.
- NEXUS_LAZY_ASYNC as a dep of an eager provider at create: revision 2 only.
- A construct hook that throws, with errors() registered, at create and at get(): `... failed: PluginError: [NEXUS_PLUGIN_FAILED] the construct hook of c failed: Error: wrap failed`.
- A NexusError another container raised and a factory rethrew stays one line.

RED (`ffw-evidence/c1-red.txt`), `cd libs/errors && npx vitest run src/parity/operations.test.ts -t "errors core raises"`:
```
Tests  9 failed | 1 passed | 96 skipped (106)
- [NEXUS_PROVIDER_FAILED] Needs (module Root) failed: AsyncTransientError: [NEXUS_ASYNC_TRANSIENT] T (module Root) is transient and its factory returned a promise. ...
+ [NEXUS_PROVIDER_FAILED] Needs (module Root) failed: AsyncTransientError: [NEXUS_ASYNC_TRANSIENT] token=T module=Root. https://nexus.js.org/errors/NEXUS_ASYNC_TRANSIENT
```
(The one pass is the "another container" test, which is already true.)
GREEN (`ffw-evidence/c1-green.txt`): `Tests 10 passed | 96 skipped (106)`. The core unit test fails with the cause loop disabled (`1 failed | 13 passed`) and passes with it.

Notes:
- Spec §9.1's own words give "a ProviderError's cause" as an example of a value user code threw. The ruling overrides that. The per-container map keeps the spec's intent, because only causes core itself raised get formatted.
- The synchronous `guard` path was not changed. It still formats any NexusError that reaches it, including one user code rethrew from another container. That behaviour predates this wave.
- ScopeRequired marks: the compiler rejects the graphs that would reach these sites during a build. I kept the marks so that any path I missed is still formatted.

## 2. FR-I2: two plugins that pin one token

What spec §3.10.3 says: `{ with: entry, pin: true }` replaces the provider, removes every other provider of the token, and makes the replacement visible in every module. The §3.10.2 order table says: "`compile.provider`: as `compile.module`, per provider". That means the first plugin that returns a rewrite for a provider decides, and a second plugin's rewrite of the same provider is NEXUS_PLUGIN_CONFLICT. The spec names no code for two pins of different providers of one token. It is silent on this case.

Per the ruling I kept last-wins and documented it. The behaviour: the provider the walk meets later keeps its pin, whichever plugin comes first.
- New test in `runtime/compile-hooks.test.ts`: two plugins pin the 1st and the 2nd Diagnostics contribution, in both plugin orders, and `get(DIAGNOSTICS)` is `['second']` each time. The test passes on unchanged code, because it records existing behaviour.
- `blueprint/hooks.ts` comment, and a README paragraph in the Plugins section.
- Owner item: should two pins of one token from different plugins be NEXUS_PLUGIN_CONFLICT?

## 3. FR-I3: benchmark calibration

- `libs/core/bench/dispatch.mjs`: each operation takes `reps` and times that many repetitions of its unit (one create, 10,000 gets, 1,000 createScopes). It returns the time of one repetition, and disposal is outside the timed part. Warm-up rounds at one repetition give a first `k`. The dropped block -1 runs at that `k` and measures warm code for the final `k` (about 10 ms per sample, capped at 1,000). `k` is printed as a column in each row. `createReps` is gone, because `create` uses the same calibration. The rule, the 7 blocks and the max-of-gaps estimator are unchanged. I did not add the reviewer's optional rerun-on-fail: the ruling says no loosening.
- Stats test (`tools/repo-checks/src/dispatch-bench.test.ts`): seeded synthetic data, 7 blocks of 15 samples per copy, 1% gaussian jitter. A 5% slowdown fails for all 20 seeds, and 0% passes for all 20. Both pass on current `decide`, which records current behaviour. When I loosened the estimator to `4 * max`, three tests failed, including "fails a 5% slowdown" (`ffw-evidence/i3-loosened-red.txt`).

Bench, `npx nx run @nexusdi/core:bench`, 5 runs at HEAD (`ffw-evidence/bench1..5.txt`). Columns: k, hooks ms, bare ms, slowdown, noise, verdict.
```
run 1 (exit 0)
create 50         9    1.000    0.991   0.50%   7.64%  pass
get 50           10    1.096    1.088   0.91%  12.83%  pass
createScope 50    9    1.007    0.999   1.10%   3.48%  pass
create 2000       1  179.803  176.806   0.71%   8.37%  pass
get 2000          4    2.601    2.504   4.66%  20.19%  pass
createScope 2000 10    1.068    1.050   2.08%   4.11%  pass
run 2 (exit 1)
create 50         9    0.986    0.974   1.18%   5.05%  pass
get 50            9    1.124    1.109   1.28%  12.01%  pass
createScope 50   10    1.016    0.998   1.95%   4.71%  pass
create 2000       1  178.020  178.379   0.55%  11.54%  pass
get 2000          4    2.663    2.410  10.18%   6.17%  FAIL
createScope 2000  9    1.108    1.083   2.32%   5.11%  pass
run 3 (exit 1)
create 50         9    0.994    0.989   1.41%   6.97%  pass
get 50           10    1.156    1.037  11.26%  11.06%  FAIL
createScope 50   10    1.006    0.994   1.35%   4.21%  pass
create 2000       1  175.773  174.011   1.09%   8.49%  pass
get 2000          4    2.434    2.471  -1.51%  14.05%  pass
createScope 2000 10    1.063    1.063   1.31%   7.36%  pass
run 4 (exit 0)
create 50         8    1.001    1.009  -0.47%   5.95%  pass
get 50           10    1.027    1.016   0.96%   5.88%  pass
createScope 50    9    1.005    0.982   2.34%   6.57%  pass
create 2000       1  184.894  182.335   1.23%  12.04%  pass
get 2000          4    2.538    2.326   9.22%   9.66%  pass
createScope 2000 10    1.046    1.047   0.72%   9.72%  pass
run 5 (exit 1)
create 50         8    1.020    1.015   1.16%   2.40%  pass
get 50            9    1.128    1.030   7.99%   8.08%  pass
createScope 50    9    1.001    0.985   1.53%   2.98%  pass
create 2000       1  183.296  180.711   0.35%   9.66%  pass
get 2000          4    2.551    2.285  11.25%  10.54%  FAIL
createScope 2000 10    1.063    1.047   1.97%   5.88%  pass
```
Result: runs 1 and 4 pass, and runs 2, 3 and 5 fail, each on one get scenario. create and createScope slowdowns stay between -0.5% and 2.4% with noise of 2.4% to 12%. Before calibration, the reviewer's noise ranged from 6.5% to 64.6%. Earlier runs during development (calibration from warm-up only) also failed get 50 once in 3 runs.

What I found (the concern):
- **A/A control.** I gave the hooks build to both labels, in 3 full runs. Every scenario passed. get 50 slowdowns were -2.9%, -2.1% and +1.3%.
- **Same failure before this wave.** The calibrated bench against bf3df20's source, 5 runs in a scratch worktree:
  - get 50: +8.2% FAIL, +7.3% FAIL, +6.2%, +2.6%, +3.2%.
  - get 2000: +0.8%, -0.8%, +8.8%, +13.8% FAIL, -1.5%.
  - So this wave did not cause the get cost. Calibration made it visible.
- **No single site to blame.** With single groups of hook sites stripped from the hooks build, each change moved get 50 by 1 to 3%, about as much as the noise:
  - guard's formatError test;
  - lookup's canon test;
  - the transient-path `now`/`construct`/`on` sites.
  - Single-copy, separate-process runs show about 2.5% on get 50.
- **Copy effects drive the noise.** The remaining A/A noise on get (6% to 20%) comes from persistent differences between module copies, which longer samples cannot shrink.
- **Decision needed.** The controller has to pick one:
  - a perf task on the get() path;
  - more copies per build for the noise estimate (a change to the estimator's inputs, which the ruling did not cover);
  - accept the finding.

  I did not change core's hot path or the rule in this wave. Until one of these is chosen, the CI bench job will fail on some runs.

## 4. FR-I4: dispose hooks after a failed setup

`runtime/nexus.ts`: when a setup hook fails, `closeFailed(state, setUp)` runs in this order:
1. Marks the root disposing (as before).
2. Awaits `state.inflight`, which covers a load or createScope a setup hook started. This is Minor 24, fixed together as the review suggested.
3. Disposes what create built, in reverse.
4. Runs the `dispose` hook of each plugin whose `setup` completed, in reverse plugin order. A plugin without a setup hook, the failing plugin and later plugins are skipped.

The PluginError's `disposalErrors` holds, in order:
- the aborted runs' rollback errors (`abortErrors`);
- the instance disposer errors;
- the dispose hook errors.

It is documented in the core README.

Tests (`runtime/runtime-hooks.test.ts`):
- **Order.** Plugins a, quiet (dispose only), b, c (setup throws) and d. The log is `init, a setup, b setup, c setup, scram, b dispose, a dispose`.
- **Errors.** A dispose that throws and a dispose that rejects both land in `disposalErrors`, in reverse plugin order.
- **In-flight scope.** A setup hook starts a createScope with a slow scoped factory and then throws. The scope's instance is disposed before the root's (`init, probe, scram`).

RED (`ffw-evidence/i4-red.txt`): all 3 tests fail. The logs were `['init 1.21','a setup','b setup','c setup','scram']` and `[]` for disposalErrors, and `['init 1.21','scram']` for the in-flight case. GREEN (`ffw-evidence/i4-green.txt`): 28 passed.

This is recorded for the owner as a decision the spec leaves open.

## 5. FR-I1: revision 1 baseline

- `examples/size/consolidation.json` has a new first record: `{ "step": "revision 1 (03f2aca)", "core": 16050, "delta": 0, "kept": true, "baseline": true }`.
  - 16,050 B comes from `node scripts/size-report.mjs --root <03f2aca worktree> --skip-build`, run after `nx build core` in that worktree. The worktree has its own `node_modules/@nexusdi/core` pointing to its own libs. The reviewer's 16,082 B came from bundling source; the script measures the dist.
  - The "revision 2 features (R1 to R16)" record also carries `"baseline": true`. Its numbers are unchanged, and it says that its delta 0 starts a new chain.
  - `size-report.mjs`'s `--record` is unchanged (it compares with the last kept record). A comment documents the `baseline` field.
- The final fix wave's step is recorded: `{ "step": "final fix wave", "core": 18866, "delta": 195, "kept": true }`. The added bytes come from the C1 marks and I4's `closeFailed`.

Draft `## Size` section for the revision 2 pull request (owner decision 1; not committed):

> Core measures 18,866 B (ESM, esbuild minify, gzip 9), up from revision 1's 16,050 B (+2,816 B, +17.5%). Spec §0 D5 estimated 13.5 to 14.5 KB after the move. By layer, minified: `errors/` fell from 10,470 to 3,016 B (D15, D21: text moved to `@nexusdi/errors`). `runtime/` grew from 17,715 to 25,656 B and `blueprint/` from 17,749 to 20,761 B (D1 roots, D10 `extend()`, D11 `eager: false`, plugin hook sites, tokenKey). The new `plugins/` is 3,607 B (the D19 registry, views and formatError). The bytes give every user the plugin API that `errors`, `devtools`, `testing` and `federation` are built on, `extend()`, `eager: false` and array roots. The registry, hooks and views cannot live in a plugin, because they are the door plugins use. (Layer figures are the reviewer's, measured at bf3df20.)

## 6. Minors

Taken:
- **1. `.fallowrc.jsonc`.** "Today's figure is 1.6%". The threshold went from 2.6 to 2.0 (a ratchet with headroom for one small clone group). The antithesis in that comment and in the size-report entry is gone. `fallow dupes` exits 0 at 1.6%.
- **2. `"dependencies": {}`** on decorators, errors, federation, node and testing (spec §12.2 shows it). New repo check `package-versions.test.ts` "gives %s the dependencies spec §12.2 lists". RED: 5 failed (`ffw-evidence/m2-red.txt`). GREEN: 26 passed.
- **14. extend() NEXUS_DISPOSED once the root disposes** (spec §6.2). It is a new test in `extend.test.ts`, so the revision 1 R17 file is unchanged. It passes on unchanged code, because the behaviour was already correct.
- **15.** RELEASING.md em dash removed.
- **16.** Antithesis comments rewritten: size-report.yml checkout, the fallow size-report entry, and lazy.ts.
- **18.** `size-compare.mjs` writes `n/a` for an empty base cell. The existing size-compare tests do not assert the cell, and 5 still pass.
- **24.** Fixed with FR-I4.

Not taken:
- **3. Keywords.** The spec names `nexusdi-plugin` for third-party packages, and no spec clause governs core's keywords.
- **4. AnyToken export.** Spec §3.10.1 declares `type AnyToken` without `export`. The dispatch says not to export it unless the spec lists it.
- **5. createTestingContainer(RootRef).** Spec §11 shows a module argument only. It would be new public API.
- **6. trace name option.** New API that the spec does not state.
- **7. Testing README note on federation override keys.** The spec does not require it. The proper fix is plugin API (owner item 7).
- **8. `Blueprint.exportedTokens`.** Something still reads it: revision 1's `visibility.test.ts:204`. Removing it changes a revision 1 test, and no ruling names that change.
- **9. DOCS_URL export.** Removing a runtime export is an API change the spec does not require, and it would change the export-list test.
- **10.** The review says no fix is required.
- **11. "Errors in a plugin" README block.** The spec does not require it.
- **12. Stronger `nexus-error.test-d.ts`.** The spec does not require it.
- **13. Root wording in the fix line.** New message text; owner.
- **17. `persist-credentials: false` in ci.yml.** The spec does not require it (hygiene only). It is cheap if the controller wants it.
- **19. Dupes refactor of the nexus.ts and scope.ts wrappers.** Not spec-required. It would be a consolidation step.
- **20.** No change, as the review said.
- **21. README note that compile.module runs twice at load.** The spec does not require it.
- **22. override() and eager.** Owner call.
- **23. `deps: null` and the double report.** The spec names no `bad-deps` rule for null, and the R25 edge is an owner or later item.

## Gates (at a845615, then a comment-only commit)

| Gate | Result |
| --- | --- |
| `rm -rf libs/*/dist && npx nx run-many -t lint test build typecheck --skip-nx-cache` | pass, 14 projects, 1,677 tests (core 905, errors 225, repo-checks 250) |
| `npm run verify:packaging` (dist deleted first) | pass, "Packaging verified." |
| `npx prettier --check .` | only `.superpowers/` workspace files warn (80, the summary line included) |
| `npx fallow dead-code --fail-on-issues` | no issues |
| `npx fallow dupes` | exit 0, 1.6% (threshold 2.0) |
| `npm run check:type-floor` | pass (TS 5.4, TS 7) |
| `npx nx run @nexusdi/toolchain-matrix:matrix` | pass, 18 cells; toolchain-matrix.json unchanged (`git status` clean) |
| `npm run size` (dist deleted first) | core 18,866; decorators 1,249, devtools 4,695, errors 4,388, federation 450, node 84, testing 1,123 |
| `npx nx run @nexusdi/core:bench` × 5 | 2 pass, 3 fail on a get scenario (see FR-I3) |
| `npx commitlint --from bf3df20` | pass |

## Self-review

- Every `raised` call is on a throw path. No hook site in `bench/sites.mjs` moved, and the benchmark's byte-identity check still passes. `closeFailed` sits behind the setup length test, so the bare build strips it with that site.
- `RAISED.get(cause as object)` on a primitive cause returns undefined without throwing.
- `closeFailed` returns errors in rollback, instance and plugin order, matching `disposeRoot`.
- The scratch worktrees (03f2aca, bf3df20) are removed, and the working tree is clean.

## Owner items added or confirmed by this wave

1. Two pins of one token from different plugins: keep last-wins (now documented), or make it a conflict (FR-I2).
2. Dispose hooks after a failed setup: implemented per the FR-I4 ruling, for the plugins whose setup completed. Plugins without a setup hook are not disposed.
3. Core size 18,866 B against revision 1's 16,050 B (+17.5%) and D5's estimate (FR-I1). The draft `## Size` text is above.
4. The dispatch benchmark: calibrated, it now shows a get() cost on the order of 1% to 11% that fails 3 of 5 runs, the same as bf3df20. A perf task, a change to the estimator, or accepting the finding.
5. Spec §9.1's example "such as a ProviderError's cause" now differs from the implementation, which formats the causes core raised. A spec edit may be wanted.

## Fix round 1: re-review findings (final-rereview.md)

Commits:
- 829eb0a fix(core): make a failed setup's close the container's disposal (N1, M4)
- cda23ac docs(core): cite the order table for the plugin conflict rule (M1)
- 3d298c0 ci: keep no credentials in the bench job's checkout (M2)
- 0a8d77e chore(repo): record core's size after the re-review fixes (18,917 B, +51)

### N1: a kept container disposed a second time

- `closeFailed` (runtime/nexus.ts) now sets `state.disposal` synchronously.
  - A later `asyncDispose()` on a container that a setup hook kept goes through `disposeRoot` (`root.disposal ??=`) and gets the close's promise.
  - No dispose hook runs twice. The failing plugin's dispose hook never runs.
  - The stored promise resolves once the close finishes; its errors reach the caller only in the PluginError's `disposalErrors`. It never rejects, so nothing is left unhandled when nobody disposes the kept container.
- One more case: a setup hook might dispose the container it kept and then throw. `closeFailed` then waits for that disposal, which runs every step itself, and returns its error, if any, as the disposal errors.

New test in `runtime-hooks.test.ts`, "makes the failed close the disposal of a container a setup hook kept":
- Plugin a keeps the container; plugin b throws in setup.
- Two later `asyncDispose()` calls return one promise.
- The log is `init 1.21, a setup, scram, a dispose`.

### M4: the `dispose` event

Spec §10.2 defines the `dispose` event, and §8.2 orders disposal as: instances, then "Emits `dispose`", then each plugin's `dispose` in reverse order. The close is now the container's disposal, so it follows §8.2:
- It emits `dispose` (disposed, errors, durationMs) after the instances and before the dispose hooks.
- A throwing observer joins the errors, as in `disposeRoot`.
- `bench/sites.mjs` now counts 12 `emit(` and 12 `const start = ...now()` sites. The site table is complete and the guarded hooks bundle is still byte-identical to the shipped one; I checked with a direct esbuild run.

New test, "emits dispose before the dispose hooks when a setup fails (spec §8.2)":
- The observed order is `dispose:instance`, `dispose` (`"disposed":1,"errors":0`), then `a dispose`.

RED (`ffw-evidence/n1-red.txt`):
```
× makes the failed close the disposal of a container a setup hook kept
  expected [ 'init 1.21', 'a setup', …(4) ] to deeply equal [ 'init 1.21', 'a setup', …(2) ]
× emits dispose before the dispose hooks when a setup fails (spec §8.2)
  expected [ 'dispose:instance', 'a' ] to deeply equal [ 'dispose:instance', 'dispose', 'a' ]
Tests  2 failed | 28 passed (30)
```
GREEN (`ffw-evidence/n1-green.txt`): `Tests 30 passed (30)`.

### M1 and M2

- M1: the pin comments in `blueprint/hooks.ts` and `compile-hooks.test.ts` now cite the order table of spec §3.10.2 for NEXUS_PLUGIN_CONFLICT. The FR-I2 section above should read §3.10.2 for the conflict rule; §3.10.3 is where `pin` is defined.
- M2: the bench job's checkout in `ci.yml` sets `persist-credentials: false`. actionlint on ci.yml is clean.

### Gates

| Gate | Result |
| --- | --- |
| `npx nx run-many -t lint test typecheck build -p @nexusdi/core @nexusdi/devtools @nexusdi/errors @nexusdi/repo-checks` | pass (core 907, errors 225, devtools 46, repo-checks 250) |
| `npx prettier --check .` | only `.superpowers/` workspace files warn |
| `npx fallow dead-code --fail-on-issues` | no issues |
| `npx fallow dupes` | exit 0, 1.6% |
| `npm run verify:packaging` (dist deleted first) | Packaging verified. |
| `npm run size` | core 18,917 B, recorded as "final fix wave, re-review" |
| commitlint 09704e8..HEAD | pass |
