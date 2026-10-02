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

- Consider `--skip-nx-cache` in build-site.mjs COMMANDS on main: a deploy build reads git tags (app/release-state.ts) and the tag tree's libs/core/package.json, which are no Nx inputs, so a cache hit could replay a stale out/ (final review, finding 1 follow-up; the meridian inputs gap itself is fixed on feat/docs-phase-1).
- RC conditions mismatch: /release-candidate/ lists two conditions for 0.4.0 final, while the snapshot blog post (apps/docs/snapshot/blog/2026-10-01-0-4-release-candidate.md:37, a D2 file this work leaves alone) adds a third (codemod run on one external codebase) and /upgrade/ says no codemod is published. Decide which story holds and align the blog or the page.
- The labels rc-blocker and rc-feedback used by /release-candidate/ and .github/ISSUE_TEMPLATE/04-rc-feedback.yml do not exist yet; GitHub drops them from filed issues until created.
- Run the docs e2e in all three engines locally (`npx playwright install --with-deps chromium firefox webkit && npx nx e2e @nexusdi/docs-e2e`): this container has only chromium 1194, and no CI workflow runs docs-e2e. E3 (search.spec.ts) and the T80 rc specs passed in chromium only.
- /benchmark-method/ links issues/new/choose; switch it to ?template=04-benchmark-setup.yml once that template lands (benchmarks spec §14.1). The Nx cache under /home/user/core/.nx/cache reached 23 GB and filled the session disk; it was cleared.
- Follow-up (interceptors): the call-time NEXUS_INTERCEPTOR_MISSING throw in libs/interceptors/src/proxy.ts (about lines 115-130) is unreachable from any container path (T71 probes: load, scope extend, scope calls, a proxy across containers, a shared plugin object). It reuses a user-visible code for a defensive guard; consider an internal assertion. The docs say compile time only.
- At 0.4.0 final: fill the dates on /support-policy/ (0.4.0 final date, six months later, whether 0.5.0 is out); add this to the stable checklist.
- npm dist-tags (seen 2026-10-02): @nexusdi/core latest 0.3.2, next 0.4.0-rc.0. @nexusdi/testing, devtools, decorators, interceptors and federation have latest = next = 0.4.0-rc.0, so a plain `npm install` of them gets the RC. The release-candidate page describes this as the rule for packages with no stable release; confirm it is intended.
- /release-candidate/ names the pinned "0.4 RC feedback" Discussion and links only /discussions until the owner creates it; give its URL to update the page.
- PR #84: merged (717e34f). T82 step 3 needs a branch from origin/main for PR A (deploy.json mode rc + publish the RC post): create fix/docs-deploy-rc or allow this session to, and create the "0.4 RC feedback" Discussion first.
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
- T42: done 1d2d28e+3b1ae5f+4e04d7d (fix steps, real tsc error, factory deps scope stated exactly; approved)
- T43: done 4804379+114cae3 (captive region restructured, codes corrected, factories output corrected; approved)
- T44: done 3c3d529+7b3dfae (try-it outcomes corrected; dispose-failures region prints a lone failure without crashing; approved after fix)
- T45: done 574381d+e6f6d9c (second diagram per spec; palette recolour handles alpha sentinels and Mermaid default literals, browser-checked in both themes; approved)
- T46: done 11bfd59+a76870f (lazy-on-MultiToken claim removed: only all() is accepted; factory contributions stated and shown; cross-module order stated; approved after fix)
- CI fix b8ac2e7: multi-providers try-it had a template literal in inline code (prerender failed in CI's docs and main jobs).
- T47: done ec94ef7 (errors() fills nearMisses: plan claim corrected with a Tactical module; messages checked against real runs; approved)
- T48: done 71cb8cf+fe4a718 (inspect region imports Engineering so the module view draws; untracked row and trace order exact; approved)
- T49: done 881afcf+650e684 (devtools trace only with a trace callback; fix steps and production try-it; triads removed; approved)
- T50: done bb42048+36f56e4 (override codes wrapped in BLUEPRINT_INVALID; unused overrideModule and lazy; no useExisting form; approved)
- T51: done d552eff+35d9d69 (fix steps incl. the server's await using break; approved)
- T52: done be4dbb5+404557d (load-twice region rewritten; LOAD_GLOBAL_MODULE thrown directly, code and module printed; approved)
- T53: done bb00c76+660fd5d (BLUEPRINT_INVALID wraps MISSING_DEPS; toolchain claims checked against toolchain-matrix; approved)
- T54: done 23fa83a+f52760b (TS1238/TS1240 and NEXUS_LEGACY_DECORATORS verified; emitDecoratorMetadata never read; decorator-free mapping; deps-missing region; approved after fix)
- T55: done 297d7da+cdbc16c+1a286a5 (compile-time codes wrapped; NOT_READY full text; proxy and exempt exact; unverified SHARED-overlap clause dropped; approved)
- T56: done fd8d160+9a2cbf4 (exit codes 1/2/3 stated; region uses a plain field so Node type stripping runs it without tsx; -o paths in cwd; approved after fix)
- T57: done 3553e9e+a42b67d (.ts files as elsewhere; packs named exactly; installs added; approved after fix)
- T58: done 18abfec+cd6146d (setup receives PluginContext; dispose only after setup; P1/P5 restated in full; approved after fix)
- T59: done 20dd399 (form link to 04-rc-feedback.yml on main; dist-tags checked on npm; two final conditions, no codemod claim; approved)
- T60: done f6e0c75+eb7a144+fc0973d (0.3 field injection, remaining 0.3 exports table, @Optional vs optional(), devtools step for graph(); approved after fixes)
- T61: done 8e686e1+52e186d (scope and end date attributed to the maintainers, RELEASING.md for mechanics; dupes unchanged at 699 lines; approved after fix)
- T62: done 01e3717+565d386 (validate() wraps MISSING_PROVIDER in BLUEPRINT_INVALID, get/resolve throw it bare, NOT_VISIBLE for an invisible provider; AMBIGUOUS try-it rewritten to print 1701; approved after fix)
- T63: done 584f9f9+84ec9f5 (bad deps entry is INVALID_PROVIDER bad-dep; INVALID_MODULE thrown bare by defineModule/create/load/get module; TS2769 named; triads fixed; approved after fix)
- T64: done e5ce249+(walk wording fix) (all four codes only inside BLUEPRINT_INVALID; lazy and REQUEST edges trigger LIFETIME_VIOLATION; defineModule cannot loop; approved)
- T65: done 9eb418b+7290618+(order fix) (LOAD_GLOBAL_MODULE also for a module importing a new global; valibot and errors installs; path differs at startup vs get chain; approved after fix)
- T66: done db50ea4+(fix) (full throw-site lists per code; invisible startup dep is MISSING_PROVIDER inside BLUEPRINT_INVALID; "array of two strings" wording also fixed on T63 pages; approved after fix)
- T67: done c9f6876+ab29e92 (DISPOSED adds has(), scope extend() and in-flight load/createScope; extend() rejects with REQUEST_MISSING; LIFETIME_VIOLATION inside BLUEPRINT_INVALID; approved after fix)
- T68: done 46a1baf+08d9593 (INVALID/VERSION/CONFLICT only inside BLUEPRINT_INVALID; FAILED four sites incl. tokenKey bare from container and scope calls; per-page fix regions; approved after fix)
- T69: done fdf482b+82232bc (all three thrown bare; exact tsconfig for TS1238; parseGraph check order; stack-trace wording; approved after fix)
- T70: done d2dcb3c+93ce88d (all three only inside BLUEPRINT_INVALID via compile.check; ^ rule with patch and major-0 minors; unused override token=module name; approved with minors fixed)
- T71: done 44f6a8c+0230f6e (per-reason arrival table; bad-target also at build; call-time MISSING unreachable, /interceptors/ sentence corrected; AUDIT token interface-first; approved after fix)
- T72: done 411e413+9001641 (NOT_READY disposed/building with building region; SHARED check and overlapping-create sites; UNCHECKED construct only; short tables to prose; approved after fix)
- T73: done eec4e11+1d608af (40 rows match code pages and libs; arrival clause per row from code pages; approved after fix)
- T77: done c9bbe9f+512c295 (method claims checked against harness; check rewrites matrix.json so restore checks out both files; issue link to /issues/new/choose until 04-benchmark-setup exists; approved with minors fixed)
- T78: done 11cdcf1+(fix) (claims match libraries.json, fixtures, results and npm; figures only via components; doc-links allowance now empty; InversifyJS flags taken from the fixture header, site blocked by proxy; approved after fix)
- T79: done e3ee28b (E3 passed in chromium only; Nextra links only Pagefind sub-results, so the page-result case searches an intro phrase; locator is getByRole(option).and(a[href]); firefox/webkit not available here)
- T80: done 913e327+(prettierignore) (25 specs pass in chromium only; assemble loaded by computed-URL import to avoid an Nx project reference to apps/docs (TS6310); SKIP_DOCS_BUILD escape hatch added; approved)
- T81: steps 1-3 done (allowances as expected; CI command passes here except core/decorators test-browser, which need chromium 1243 (CI has it); vitest direct passes; rc artifact deployable; final artifact skipped, gh unauthenticated). Step 4 sweep: 5 band reviewers; 16 fixes in 422f4ea (incl. PROVIDER_FAILED path, scope.extend, createScope eager-only; three H2s renamed with commitments.json). release/0.4 gained 2 bench-kit commits (no conflict). Final opus review: CHANGES_REQUIRED (meridian not a docs build input; .. in region paths; vacuous typecheck test; final-mode commit links; stale fallow comments), fixed in fb73c7c..44f8404, re-review APPROVED. PR #84 body updated; CI green on 44f8404 (13/13 checks); marked ready for review.
- T82: step 1 done (next-source on main: /next/ builds from release/0.4 at 717e34f, the #84 merge). Step 2 done: docs.yml rehearse=rc run https://github.com/NexusDI/core/actions/runs/37021398319 succeeded (pick /next/ source, build /next/, assemble and check-artifact passed; root-release build and snapshot-revision steps skipped as rc expects; deploy and smoke skipped). Step 3 (PR A on main: deploy.json mode rc + publish the RC post) waits on the owner: it needs a branch from origin/main (branch creation is reserved to the local session) and the "0.4 RC feedback" Discussion the post names must exist first. Steps 4-5 follow the owner merge and docs-snapshot.yml.

## Status summary (2026-10-02)

- Tasks done: 1-81 (Group M via #80, Tasks 14-81 via #84) and Task 82 steps 1-2. Task 82 steps 3-5 wait on the owner (see T82 above).
- PRs merged: #80 (Group M), #82 (main -> release/0.4 sync), #84 (phase 1 into release/0.4, merge 717e34f). Open: none.
- /next/ status: not live yet (rc rehearsal green; the deploy happens when PR A switches deploy.json to rc on main). nexus.js.org is blocked by this container's egress proxy, so the curl check must run elsewhere.
- Owner items: see "Owner items" above (PR #84 merge, T82 branch for PR A, three-engine e2e run, RC Discussion and labels, RC conditions vs blog, dist-tags, deploy-build cache, interceptor guard follow-up, support-policy dates at final, benchmark issue template link).

## Front page concepts

Branch concept/frontpage (from release/0.4 at 717e34f), commits 9e5ab6f..990dd61, pushed; no PR.

- Research: specs/2026-10-02-frontpage-research.md. This environment's network policy blocked direct fetches of the studied sites, so the findings rest on search summaries and mark the unverified pages.
- Concepts: concepts/frontpage/concept-a.html (pixel-art), concept-b.html (cel-shaded), concept-c.html (pre-flight console blueprint). Each is one static file with inline SVG, CSS and JS, no network requests, light and dark, mobile at 375px, an interactive hero showing power-up in dependency order and the Nexus.check failure naming the missing system with launch blocked.
- One opus critique pass across the three (frontpage-critique.md next to this file), then one fix pass per concept. Shared corrections: install `npm i @nexusdi/core@next`, links to /next/, Nexus.check shown synchronous with the real BlueprintError and NEXUS_MISSING_PROVIDER output, comparison rows corrected (NestJS standalone apps, partial graph check at bootstrap; InversifyJS constructor injection), small-container wording that the docs comparison backs.
- Recommendation (concepts/frontpage/README.md): build on B, with C's pointer labels and per-section pass and fail list and A's deck-by-deck caption.
- Owner items: confirm the NestJS and InversifyJS comparison rows against pinned versions and date the table; B's arrow labels need a spacing pass on phones; the headline in B uses the Impact system stack with a sans fallback.
