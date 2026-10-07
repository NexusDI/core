---
name: nexusdi-ways-of-working
description: How work runs in the NexusDI repo. Covers who decides what, subagent-driven execution with reviews and a ledger, the owner-only list, the design pillars, the extension principle (P1 to P5), the writing rules for docs, specs and commit prose, and the git rules. Use it at the start of any NexusDI task that plans or executes work, writes a spec, doc, README, blog post or commit message, designs or reviews an API, dispatches subagents, or needs a decision from the owner, even when the task looks small.
---

# Ways of working in NexusDI

## Roles

- The main session orchestrates and decides. Subagents do the work, each with
  a model matched to the task: haiku for mechanical git and gh chores, sonnet
  for routine implementation and releases, opus for design, audits, reviews
  and tricky engine work. Give each subagent a complete brief, since it does
  not see the conversation.
- Plans run subagent-driven: an implementer per task, a reviewer, fix rounds
  until the reviewer is satisfied, and a ledger at
  `.superpowers/sdd/<plan>/progress.md`. After a compaction, trust the ledger
  and `git log`.
- An independent opus reviewer does the final review of a branch. A self-review
  by the implementer or the controller never counts as the final review.
- An open question goes to an opus architect subagent, which proposes a ruling.
  An opus tech lead subagent then challenges it against the pillars and users.
  The tech lead's call stands. Record it in the ledger and report it to the
  owner afterwards in one line.

## Owner-only

Stop and ask the owner for these, and nothing else:

- a merge to `main`, or any npm publish
- security settings or GitHub settings
- removing or renaming public API the owner required
- a large pillar trade-off, such as core size or a new mandatory dependency
- reversing an earlier owner decision

The architect and tech lead settle everything else: additive exports, small API
additions, spec-internal choices, test and CI policy, small core fixes.

## Asking the owner

Explain before proposing. Every question must stand alone and give:

1. what the feature or change does
2. the concrete case it affects
3. the consequence for users, with any removal or rename called out
4. your recommendation

Never refer to a question by its ledger ID alone (R4-Q4, K14). The owner does
not read the ledger. List every decision; do not cap the number.

## Pillars

Judge every design against these, and flag any move away from one:

- a modern, lightweight DI container for TypeScript
- not complicated
- a powerful module system
- Nest-style static configuration of modules (`forRoot`, `forRootAsync`)
- a developer-friendly API
- lightweight: few dependencies, a minimal bundle
- class and factory providers
- an async core
- TS 7 support

Users come first, 0.3 users included. State what a proposal changes for them:
migration cost, learning curve, bundle size, runtime behaviour.

## The extension principle

A package integrates with another through a public contribution point that a
third party can use the same way. Adding an error, an event, a node note or a
package never requires a change in a package that does not own it. The rules
come from `specs/2026-09-30-extension-principle-design.md` on
`origin/spec/package-owned-errors`:

- P1. The owner holds its vocabulary. A package reads another package's codes,
  event types, ids and hidden fields only through what the owner exports. No
  table, switch, regex or string compare over them, and no `Symbol.for` on
  another package's key.
- P2. A set that others extend is open in its type (an augmentable interface or
  a registration argument), and code that branches on it handles an unknown
  member. A set only its owner adds to may stay a closed union.
- P3. Cross-package integration goes through public, versioned contribution
  points: a plugin hook, a `PluginContext` member, a view field or an options
  argument. Core names no other package. A break raises `NEXUS_PLUGIN_API`.
- P4. No copy of another package's logic. The owner exports a shared helper and
  the other package imports it.
- P5. Optional dependencies point one way and degrade by construction: only
  `import type`, or a subpath the application opts into. No runtime detection
  of a missing package, no lookup of a plugin by name, no dynamic import of a
  `@nexusdi/*` peer.

Each rule has a CI test and a named list of exceptions. A new exception needs a
spec change. Treat any central registry or table that names other packages as
a defect.

## Writing rules

Docs pages, READMEs and blog posts follow `docs/documentation-style-guide.md`.
A page runs Context → Concept → Detail: the problem the reader has, then the
name and the idea that solve it, then the API and the example. Titles state
the purpose ("Identifying Dependencies with Tokens"), each section opens with
a lead-in sentence, the simple case comes before the edge cases, and each
page ends with the next step. A heading does not have to name NexusDI.

These apply to docs, specs, READMEs, blog posts, comments and commit prose.
Each one is a defect to fix before sending:

- em dashes (write two sentences, or parentheses for a short aside)
- bold lead-ins in specs, comments and commit prose (docs and READMEs may
  use them)
- antithesis in any form: "not X but Y", "X rather than Y", "instead of", and
  "X was never the question. Y was."
- abstract or inanimate subjects: every sentence names who or what acts
- gerund phrases as subjects
- the rule of three: use two items or four
- naming the pattern ("the same shape as", "the tell is", "the failure mode")
- metaphor verbs for technical facts: bites, lands, buys, costs, earns, pays,
  survives, ships
- filler openers: "worth noting", "the thing is", "notably", "importantly"
- tables with fewer than four rows

Content rules:

- Never write the word "native" about NexusDI or decorators. A repo-check
  refuses it next to "decorator" in the docs.
- Never mention reflect-metadata in new docs or marketing copy.
- Examples after the first docs page are interface-first: a
  `Token<IReactorCore>`, `provide(REACTOR, { useClass: FusionReactor })`, and
  consumers that declare the token in `deps`. Never bind one concrete class
  straight to another.
- Check every claim about behaviour against `libs/` before it is published.
- Examples run as tests: a docs page cites a region of
  `examples/meridian/src/pages/<slug>.md`, and every `ts` block in a README is
  a doctest. At least one of them carries a `// ->` claim.
- Posts lead with what NexusDI does for the reader. The design reasoning stays
  in the specs.

## Git rules

- Never skip hooks: no `--no-verify`, no `-c core.hooksPath=/dev/null`. Fix what
  the hook reports.
- Never run a bare `git stash`. Worktrees share one stash stack with other
  sessions. Use a temporary WIP commit.
- Force-push only a PR's own branch, only with `--force-with-lease`, and only
  after a rebase.
- Prefix nx and git with `NX_NO_CLOUD=true NX_DAEMON=false`, or Nx Cloud can
  hang the command and the pre-commit hook.
- `main`, `release/X.Y` and `X.Y.x` are linear. The hooks refuse a merge commit
  outside `sync/*`. Replay work with `git cherry-pick` or `git rebase --onto`.
- Commit messages follow conventional commits with a scope from
  `commitlint.config.js`, and end with the `Co-Authored-By:` trailer the
  session's system prompt gives.
- Push agreed branches and open PRs without asking again. Merging to `main`
  stays with the owner.

For anything that touches a release, use the `nexusdi-release` skill.
