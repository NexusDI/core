# Globals for every docs-phase-1 task

Plan: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md (branch plan/docs-phase-1).
Read its "Global Constraints" (lines 15-62) and "Review Focus" (lines 63-75).
Spec: /home/user/core/specs/plans/sdd-docs-phase-1/spec.md (copy of
origin/spec/docs-site:specs/2026-09-23-docs-site-design.md @ 6667eca).

Worktrees (never touch another one, never switch branches):
- Group M (Tasks 1-13): /home/user/wt/docs-phase-1, branch fix/docs-pipeline.
- Groups A-Z (Tasks 14-81): /home/user/wt/docs-phase-1-release, branch feat/docs-phase-1.

Environment (cloud container):
- Start every shell command with `export PATH=/opt/node24/bin:$PATH NX_NO_CLOUD=true NX_DAEMON=false;`.
  The repo needs Node 24.20.0 (.nvmrc); the default node is 22 and npm ci fails under it.
- node_modules is installed in both worktrees. Run `npm ci` again only after a lockfile change.
- `gh` is not authenticated; GitHub operations are done by the controller.

Rules that override the plan text:
- Every commit message ends with exactly:
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
- Prefix git and nx with NX_NO_CLOUD=true NX_DAEMON=false.
- Commit subjects pass commitlint: lower case subject, header at most 100
  characters. Put error codes in the body, never in the subject.
- Run `npx fallow dupes` and the touched projects' lint, typecheck and test
  before reporting DONE. The repo's CI runs fallow (dupes and dead code).
- CI runs fallow on a clean checkout: no build output (dist/, apps/docs/generated/,
  .next/, out/). Run `npx fallow dead-code --fail-on-issues --no-cache` once with
  those moved aside (to /tmp/claude-0/), then put each back at its own path.
  Check afterwards that no new directory appeared (an earlier run left empty
  libs/libs/* behind, which broke repo-checks tests).
- Fix triads (rule of three) and other writing-rule breaks in any prose the
  plan hands you verbatim.
- The plan says no git or nx command carries the env prefix; add it.
- The machine has 4 cores. Run `uptime` before heavy runs.
- Pinned versions: see plan Global Constraints.

Decisions in force (progress.md, tl-q1-q2.md):
- D2 (Q1): Group M touches none of apps/docs/snapshot/blog/2026-10-01-0-4-release-candidate.md,
  apps/docs/snapshot/announcement.mjs, apps/docs/tools/snapshot-overlay.test.mjs,
  apps/docs/tools/__fixtures__/snapshot-blog/.
- D3 (Q2): region roots are examples/meridian/, libs/<pkg>/README.md and
  libs/<pkg>/docs/**/*.md, a libs path counting only when that package's
  vite.config.ts calls docExamples() and docExampleSources(). No libs/codemod/.
- D5: meridian ground colour roles are --meridian-ground-0 and --meridian-ground-2
  (the plan's names collided with spacing --meridian-space-N). Use these names
  wherever the plan writes the old ground role names (Tasks 18, 22, 23 and later).
