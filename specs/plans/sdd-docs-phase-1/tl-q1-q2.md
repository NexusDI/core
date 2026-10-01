TECH LEAD FINAL (stands). Q1:
- Group M touches none of: apps/docs/snapshot/blog/2026-10-01-0-4-release-candidate.md, apps/docs/snapshot/announcement.mjs, apps/docs/tools/snapshot-overlay.test.mjs, apps/docs/tools/__fixtures__/snapshot-blog/.
- Task 12: keep Steps 1-3 (04-rc-feedback.yml, labels.json). Drop Step 4. Step 5 makes only the first commit. Fix the triad in the form's "What happened" description. Remove the post and overlay test from Files/Produces.
- Task 82 PR A: deploy.json mode flip only, from origin/main, after the Step 2 rehearsal; no draft sed, no test rename; no wait on #74. Steps 4 and 6 (curl /next/getting-started/ 200) follow it. Root stays snapshot r1 (plain 0.3).
- Task 82 PR B (precondition #74 merged): re-add /next/upgrade/ link in announcement.mjs + comment; restore "links the post and the upgrade guide" test; rewrite post's "What is not ready yet" bullets: the /next/-not-live bullet and the migration-guide bullet (/next/upgrade/ is the guide); "We will post here when the guide and the codemod are out" names the codemod only; codemod bullet stays; swap Feedback bug bullet from 01-bug.yml to the RC feedback form. Step 5 (snapshot r2, href check) after PR B.
- Rule: no docs-snapshot.yml dispatch between #74 merge and PR B merge.
Q2:
- Task 32 Step 4: region roots = examples/meridian/ + libs/<pkg>/README.md + libs/<pkg>/docs/**/*.md; a libs path counts only when that package's vite.config.ts calls both docExamples() and docExampleSources(). Drop libs/codemod/. Build roots from the tree with a function (no const); print readable roots in the finding. Add a fixture package without the wiring whose cited docs file must fail. Take globs from docExampleSources() in tools/doc-examples; if importing it into repo-checks creates an nx project-graph cycle, STOP and ask the owner.
- Task 35 (task-35.md ~line 209): reviewer text names these roots.
- Spec §14.3/§14.6: patch on spec/docs-site (planning edit).
- Phase 1 pages cite examples/meridian only. Task 2 unchanged.
