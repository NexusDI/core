# Docs phase 1 cloud handoff

You are the build controller for NexusDI docs phase 1, running in a cloud session. The goal is nexus.js.org/next/ live (HTTP 200) with the core pages and the RC pages.

## Read first

- Plan: specs/plans/2026-09-23-docs-phase-1.md on branch plan/docs-phase-1.
- Spec: the docs spec on branch spec/docs-site (6667eca or later).
- The ledger and rulings in this folder: progress.md, preflight.md, implementer-rules.md, reviewer-rules.md, architect-q1-q2.md and tl-q1-q2.md. Trust progress.md: a task marked done is done. Do not redo it.
- The skills .claude/skills/nexusdi-ways-of-working and .claude/skills/nexusdi-release on main.

## State at handoff (2026-10-01)

- Group M (the pipeline on main) works on branch fix/docs-pipeline, pushed at b8dc41e. Task 2 is done. Task 3 is in a fix round: move filesUnder to its own module and subpath, and fix the prose, including the word "native" in Task 2's d.mts.
- The release/0.4 work is on branch feat/docs-phase-1, pushed at b989bcf. Tasks 14, 19, 20 and 21 are done. Task 22 is committed (a57169d, b989bcf) and awaiting review.
- These tasks can run before the sync: 19, 20, 21, 22, 24, 26, 29, 33, 35, 74, 75, 76. The rest wait for the main to release/0.4 sync (Task 13).

## Method

- Work subagent-driven: one fresh implementer per task, then a task reviewer on the diff, then fix rounds as needed. Run one implementer at a time per branch.
- Budget models:
  - Implementers use sonnet, or haiku for transcription tasks.
  - Task reviewers use sonnet.
  - Use opus only for the final whole-branch review, and for an architect plus tech lead pair on a genuine design question. The tech lead's call stands.
- After each task, update progress.md in this folder, commit it to plan/docs-phase-1, and push. Push the work branches after every task.

## Authority

The owner granted these on 2026-10-01. Each merge needs green CI and a clean review first.

- Merge the Group M PRs into main.
- Dispatch the release workflow's `sync` event, which publishes nothing.
- Merge the sync PR, merging with a merge commit.
- Merge into release/0.4, including PR #73.
- Run Task 82, the deploy.json switch to rc on main, after a green `docs.yml` run with `rehearse: rc`.

Never do any of these:

- publish to npm, or dispatch release.yml with rc, stable or patch
- change GitHub settings (required checks, labels, rulesets)
- create Discussions
- use --no-verify or `-c core.hooksPath`
- force-push, except a PR's own branch with --force-with-lease after a rebase

Record anything that needs the owner in progress.md under "Owner items", and carry on with other tasks.

## Rules

- Prefix nx and git commands with NX_NO_CLOUD=true NX_DAEMON=false.
- Commit messages end with: Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
- Prose rules: no em dashes, no bold lead-ins, no antithesis. Never write "native". Never mention reflect-metadata. Examples are interface-first.
- When a best practice conflicts with an owner rule, list the conflict under "Owner items" and do not resolve it.

## Done when

- `curl -sI https://nexus.js.org/next/` returns 200.
- The core pages and the RC pages are reachable.
- The final review is clean.
- progress.md ends with a summary: tasks done, PRs merged, the /next/ status and the owner items.
