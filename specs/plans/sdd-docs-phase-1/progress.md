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
- T3: fix: move filesUnder to own module+subpath, prose fixes incl. "native" in Task 2 d.mts.
- T22: review a57169d+b989bcf (opus reviewer)
