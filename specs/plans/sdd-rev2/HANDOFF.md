# Revision 2 execution handoff

Execute specs/plans/2026-09-24-core-0.4-revision-2.md (26 tasks, R1-R26) on branch feat/core-0.4, starting at 03f2aca. The spec is specs/2026-09-23-core-0.4-design.md (revision 2) and it binds; the plan argues from it. Read controller-brief.md, constraints.md, implementer-common.md and reviewer-common.md in this directory first. Their paths refer to a git-ignored `.superpowers/sdd/2026-09-24-core-0.4-revision-2/` workspace, so recreate it in your checkout.

Method: subagent-driven development (superpowers:subagent-driven-development if available). Run a preflight conflict scan of R1-R26 and rule on every finding. Then for each task: a fresh implementer with a brief file, a task reviewer (spec and quality) on a diff file, and fix rounds if needed. After R26: a whole-branch final review on the most capable model, one fix wave, and a scoped re-review. Never run two implementers in parallel.

Rules:
- Every revision 1 test stays green or moves with its feature.
- R1 snapshots freeze revision 1 message text before R5 moves it.
- The gates must pass: nx lint, typecheck, test and build; fallow; verify:packaging; prettier.
- No --no-verify, no force-push, no merge, no publish, no main, no GitHub settings.
- Commits end with the Co-Authored-By trailer.
- Owner rules: follow the pillars (a lightweight core, not complicated, modules, forRoot, developer friendly, class and factory providers, async core, TS 7) and put users first. Examples are interface-first after page 1. Never write "native". No reflect-metadata mention. No em dashes, no bold lead-ins, no antithesis.
- A pillar divergence, or an API removal or rename the spec does not state, is an owner decision. Record it, pick the least divergent option, and continue.

Persistence:
- Push feat/core-0.4 after every task.
- Keep the ledger as progress.md in this directory, commit it to plan/core-0.4-engine after every task, and push.
- On resume, trust the ledger and git log, and never redo completed tasks.

Stop only for:
- an irreversible or destructive operation
- a security-sensitive action
- a merge or publish
- a plan so broken that every path is a guess
