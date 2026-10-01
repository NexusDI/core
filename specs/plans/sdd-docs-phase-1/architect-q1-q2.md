Q1 (PR #74 vs Tasks 12/82), architect ruling:
- Group M does not touch: apps/docs/snapshot/blog/2026-10-01-0-4-release-candidate.md, apps/docs/snapshot/announcement.mjs, apps/docs/tools/snapshot-overlay.test.mjs, apps/docs/tools/__fixtures__/snapshot-blog/.
- Task 12: keep Steps 1-3 (04-rc-feedback.yml, labels.json). Drop Step 4 (post edits, codemod cut, Feedback rewrite, codemod test). Step 5 makes only the first commit. Fix the triad in the form's "What happened" description.
- Task 82 Step 3 splits into two PRs from origin/main. PR A: deploy.json mode flip only (no draft sed, no test rename); merges whether or not #74 merged. PR B (precondition: #74 merged): re-add /next/upgrade/ link in announcement.mjs + comment, restore "links the post and the upgrade guide" test, rewrite the post's "What is not ready yet" bullet saying /next/ is not live, swap Feedback bug bullet from 01-bug.yml to the RC feedback form. Step 5 (snapshot rev 2, href check) after PR B.
Q2 (REGION_ROOTS), architect ruling:
- REGION_ROOTS = examples/meridian/, libs/<pkg>/README.md, libs/<pkg>/docs/*.md. Drop libs/codemod/. Reason: 2ff7a7f moved core examples into libs/core/docs/*.md; 163ef14 doctests docs/**/*.md; spec §14.3 allows libs/*/README.md.
- Change lands in Task 32 Step 4 (regex list, readable string list for the message; a libs path counts only if that package's vite.config.ts calls docExamples(); libs/cli has docs/examples.md without docExamples). Task 2 unchanged.
- Task 35 reviewer text (task-35.md line 209) names the three roots. Spec §14.6 (spec line 2390) patched to match.
- Phase 1 pages still cite examples/meridian only.
