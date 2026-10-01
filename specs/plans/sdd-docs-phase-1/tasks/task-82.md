# Task 82 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 30466-30637 (read them all).
Shared constraints: tasks/globals.md in this folder.

## Amendments (these override the plan text)

Tech lead ruling: PR A = deploy.json mode flip only, from origin/main, after the Step 2 rehearsal (docs.yml rehearse: rc, green); no draft sed, no test rename; no wait on #74. Steps 4 and 6 (curl /next/getting-started/ 200) follow it. PR B (precondition: PR #74 merged): re-add /next/upgrade/ link in announcement.mjs with its comment; restore "links the post and the upgrade guide" test; rewrite the post's "What is not ready yet" bullets (the /next/-not-live bullet and the migration-guide bullet; /next/upgrade/ is the guide); "We will post here when the guide and the codemod are out" names the codemod only; codemod bullet stays; swap the Feedback bug bullet from 01-bug.yml to the RC feedback form. Step 5 (snapshot r2, href check) after PR B. No docs-snapshot.yml dispatch between the #74 merge and the PR B merge.
