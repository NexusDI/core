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
- T74: review 08e33cd (WORKSPACE/OUTPUT/gitCommit/FAMILIES unexported for fallow)
- T9: impl
