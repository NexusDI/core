# docs-phase-1 ledger

Plan: origin/plan/docs-phase-1 @ 3e16b15, specs/plans/2026-09-23-docs-phase-1.md (copy: plan.md here)
Spec: origin/spec/docs-site @ 6667eca, specs/2026-09-23-docs-site-design.md (copy: spec.md here)
Task briefs: tasks/task-NN.md, shared constraints tasks/globals.md

## Grants from the user (controller brief, 2026-10-01)
- Merge into release/0.4 allowed when CI green and review clean.
- Sync main->release/0.4 (sync PR, merge commit) allowed; docs.yml rehearse=rc and docs-snapshot.yml dispatch allowed.
- PR #73 may be merged when green.
- Main merges: owner only. Stop and report PR URL. deploy.json mode flip: report before merge.
- Never: npm publish, release.yml real dispatch? (sync event via release.yml is the plan's route; user said "never dispatch release.yml") -> see decisions.

## Worktrees
- Group M: .claude/worktrees/docs-phase-1, branch fix/docs-pipeline from origin/main @ 7646ad4

## Decisions
- D1 Sync route: user forbids dispatching release.yml; do the sync by hand per RELEASING.md "Sync" (sync/0.4-<sha12> branch, merge commit, PR into release/0.4). Details in preflight.md.

## Side items
- PR #73: rebased, all checks green, build.json core 0.4.0-rc.0 matches libs/core; rebase-merged into release/0.4 at 18:53Z.

## Tasks
(status: todo | impl | review | fix | done <sha> | blocked <why>)
- T1: done (no commits; baseline green, 4300fa5+3d956dd on main, mode snapshot-only)
- Preflight done (preflight.md). Pre-sync tasks on feat: 19,20,21,22,24,26,29,33,35,74,75,76. Rest need the sync.
- Worktree feat: .claude/worktrees/docs-phase-1-release, branch feat/docs-phase-1 from origin/release/0.4 (pre-sync; rebase after sync).
- Open Qs to architect: Q1 PR #74 vs Tasks 12/82; Q2 REGION_ROOTS libs/codemod vs libs/*/docs regions (163ef14).
- Implementer notes from preflight: code-page commit subjects must pass commitlint (lowercase, <=100; codes in body); run `npx fallow dupes` before each PR; fix triads in plan prose.
- T2: done 0578605+5735c36 (fallow 2.4%). TODO before first push: normalize trailer of 0578605.
- T14: done (baseline green on release/0.4 pre-sync, no commits)
- T19: impl (sonnet)
- D2/D3 (tech lead final, tl-q1-q2.md): Q1 Group M avoids #74 files, Task 12 drops Step 4, Task 82 splits PR A (flip) / PR B (after #74), no docs-snapshot dispatch between #74 merge and PR B. Q2 region roots via docExamples()+docExampleSources() wiring in Task 32. Briefs 12/32/35/82 carry the amendment.
- Owner items so far: create+pin "0.4 RC feedback" Discussion and fill DISCUSSION_URL in #74, merge #74; labels rc-feedback/rc-blocker; add `docs` to required checks (main, release/*); #66 (next 16.3.6, red) and #59 to handle after Group M.
- TODO spec patch: §14.3/§14.6 region roots on spec/docs-site.
- T19: done a9044cd (review approved; trailer amended)
- T20: done 7700809
- T21: done e14ba62 (approved). D5: ground colour roles renamed --meridian-ground-0/2 (collided with spacing --meridian-space-N); briefs 18/22/23 amended.

## Cloud session (2026-10-01, controller per HANDOFF.md)
- Env: repo needs Node 24.20.0; installed at /opt/node24 (prefix PATH). Worktrees moved to /home/user/wt/{docs-phase-1,docs-phase-1-release} (nested under the repo, nx resolved the parent checkout's tsconfig). Task briefs regenerated in tasks/ (plan line ranges + amendments); spec.md copied here.
- HANDOFF grants supersede the grants above: controller may merge Group M PRs into main, dispatch release.yml event=sync, merge the sync PR (merge commit), merge into release/0.4, run Task 82 after a green rehearse rc.
- T3: done 845b364+b8dc41e+1b716c2+715c28f+571b211 (filesUnder in files-under.mjs, subpath ./files-under; prose fixes; review approved after round 2)
- T22: done a57169d+b989bcf+e14b2e1 (fallow entry for props.test-d.tsx)
- T24: done 36a35d0 (approved)
- T4: done 5031b06 (md-siblings written in-repo: the classifier denies fetching code from Evanion/libraries here; approved)
- T26: done 44cae80 (approved; fenceClass unexported, no later consumer)
- T5: done 8b34a6c+dd2b681 (shared from page-kind scripts; NOT_PAGES skips 404/_not-found, real build failed without it; approved)
- T29: done 9b69f33+335cfad (dash patterns built from char codes: prettier turns \u escapes into literal dashes; approved)
- T6: done 56b3ee9 (approved; postbuild needs the build's DOCS_CHANNEL, Task 7 passes it)
- T33: done ca375a6 (approved)
- T7: done ce7c11a+07c832c ("Add the blog before setting final"; approved; actionlint not run locally, CI runs it)
- T35: done 21de2f5+723133d (prose fixes; trap headings without periods, sentences kept for the pin test; approved)
- T8: done 5147ed6 (approved)
- T74: done 08e33cd (WORKSPACE/OUTPUT/gitCommit/FAMILIES unexported for fallow, no later importer; approved)
- T9: done b81c18e+d721907 (retired case tested; approved)
- T75: done 82c3674 (apps/docs depends on @nexusdi/meridian-ui; tags after ...components pre-sync; approved, real build passes)
- T10: done 21f5708+9aeb791 (unknown base commit -> touched=true; approved). Watch the first CI run: rc and final builds share one checkout.
- T76: done 4532ad4 (approved). Pre-sync, repo-checks docs-trigger.test.ts fails on feat (docs.yml lacks benchmarks/**); T10's docs.yml change fixes it after the sync.
- All pre-sync feat tasks are done. feat waits for the sync.
- T11: done 2efaa11 (approved)
- T12: done 358572d (form + labels only per TL; triads fixed)
- T13: PR #80 merged by the owner. Sync pending (see Owner items). PR #80 (fix/docs-pipeline -> main) opened. Final opus review fixes: noindex check in any attribute order (the real r1 archive failed the final check), CodeQL polynomial regexes (preamble, {@link}), MODE via env, GH_TOKEN on the snapshot step only: c1f75e1 8335be2 8a64b57 33af5d2 9379d55. 68e6178 (CodeQL {@link} regex). CI all green, mergeable clean at 68e6178. The merge into main was refused by the session's permission classifier; waiting on the owner to merge #80 (rebase). Then: release.yml event=sync on release/0.4 (expect a ci.yml conflict: keep both job lists).

## Owner items
- PR #84 (feat/docs-phase-1 -> release/0.4): merge after Task 81 and the final review; draft until then.
- PR #80 merged into main by the owner (main 37aeb64).
- Sync main -> release/0.4: `git merge-tree` shows one conflict, .github/workflows/ci.yml (both sides append jobs; keep both). release.yml event=sync would stop on it. This session's hand sync (sync/0.4-37aeb64xxxxx branch, merge, push, PR) was refused by the permission classifier. Needs the owner (or a permission rule) before Tasks 15-82.
- T4's md-siblings module was written in this repo; the plan's copy from Evanion/libraries was not made.
- After PR #80: create the labels rc-feedback and rc-blocker; add `docs` to the required checks of the main and release rulesets; pin the 0.4 RC feedback Discussion and fill DISCUSSION_URL in #74; decide #66 and #59 (see preflight).
- Spec patch §14.3/§14.6 region roots on spec/docs-site is still open (planning edit).

## Owner instructions (2026-10-01, after PR #80)
- The local session does the main -> release/0.4 sync and every merge from here on. This session does no merges, syncs or branch creation.
- After the owner reports the sync merged: rebase feat/docs-phase-1 onto release/0.4, continue Tasks 15-82, open PRs, leave them green, list each under Owner items for the local session to merge.
- Task 18: write the copied modules in this repo, as in Task 4.
- Commit 0578605's trailer stays as is.

## After the sync (PR #82, 4e9095f on release/0.4)
- feat/docs-phase-1 rebased onto origin/release/0.4 (922f2a2): conflicts in apps/docs package.json, tsconfig.json, mdx-components.js, package-lock.json resolved by keeping both sides; lint/typecheck/test of docs, repo-checks, doc-examples, meridian-ui, meridian green; fallow clean; sync:check clean. Force-pushed with lease.
- Draft PR #84 (feat/docs-phase-1 -> release/0.4) opened for CI on every task. Known flaky: tools/bench-kit/src/sampler.test.ts "runs teardown after the timer stops" (rerun CI if it alone fails).
- CI fixes on #84: 05a91b4 (fallow ignores unresolved imports of generated/benchmark-data.json and dist/styles.css: absent on a clean checkout), 5e6ac99+dea0dcb (prose budget strips html comments with a scan; CodeQL).
- T15: done a70d8ca+7cafc3b (approved; chromium e2e 7/7 locally, firefox/webkit not available here). CI installs only chromium and runs no e2e: the task that adds the e2e job (79/80) must install chromium firefox webkit.
- T16: done ceb7256 (approved; vitest include gains content/)
- CI fix: 8e335c5 meridian type-check test timeout 60 s (5.7 s on CI vs 5 s default).
- T17: done 8f10fc8+6af2518 (approved). .nexus-release has no CSS: amendment added to task-23.md.
- T18: done 3920f80+56c342b (listing/diagram loaders, components and tests written in this repo per owner; review fixes: Mermaid error handling, aria-labelledby, IO fallback, caption quotes rejected, ~~~ fences; approved). Mermaid colour leak check moved to Task 45 brief.
- T23: done 99e217e+1d90bed (html:root ground gradient outranks Nextra's inline html background; surface scan in both themes, any colour-function alpha; .nexus-release HUD strip; approved after fix)
- CI fix 9e9b132: fallow ignores @nexusdi/meridian-ui/styles.css (dist absent on a clean checkout).
- T25: done c6cc9be (approved; floor allowance 13 pages)
- T27: done 0666aad (approved; loadReferenceExpander/loadBehaviours/loadDeclarations dropped, no later user; loadRegionExpander/loadMdSiblings/loadRegions held for Tasks 30-32 in fallow ignoreExports)
- T28: done e54d867 (approved; also checks hrefs that components, app/ and _meta.ts emit; /release-candidate/ allowed until Task 59, brief amended)
- T30: done b17bf30+840f740 (approved; shared ratchetFindings helper in docs/allowance.ts for doc-fence and doc-domain, dupes 1.8%; later guards with an allowance ratchet reuse it)
- T31: done 326decc+ce0bbce+521dcaa (no allowance, as the plan; comments stripped, provide<T>(, typed deps, bracket-depth deps entries; review fixes verified by the controller with an uncached run: 726 tests)
- T32: done 3249b86+d59a4ae (D3 regionRoots from the tree; captions guard uses the loader's quote/backslash rule; wiring check strips comments; approved)
- T34: done d7b414d+9fd68d4 (codesByPackage over the existing AST declaredCodes; 40 codes allowed until Tasks 62-73; undeclared allowance keys reported; approved)
- Groups A-E done. Group P (pages) starts.
- T36: done 72b9bc6+7208c89 (plan text verbatim; added the dependency count; decorator settings sentence made exact; approved)
- T37: done c3b8107+c011d7f (triads rewritten; decorator settings sentence; tokens requires getting-started; fix step added per decision 33; approved after fix)
- T38: done 6886613+dfe2986+9ddbf28 (try-it steps completed; tsc error location corrected; approved after fix)
- T39: done 30ccc67 (error codes corrected to BLUEPRINT_INVALID wrapping; try-it outputs and fixes added; approved)
- CI: main failed once at 9ddbf28 on next/font/google fetches (network); job re-run once. Fixed in dbebe6a: next/font/local with pinned @fontsource 5.3.0 packages (latin woff2); the build passed with outbound proxies pointed at a dead port.
- T40: done 66164f1+527e9f8 (TS2769 location and runtime codes exact; async try-it added; approved)
- T41: done 6453399+3025642 (missing-export region fixed: Tactical exports DRONE, codes corrected; create vs get codes stated; approved). Removed empty libs/libs/* left by a fallow move-aside.
- T42: impl
