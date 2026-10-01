---
name: docs-page
description: Use when writing or changing a page in apps/docs or a mission briefing in apps/docs/academy. The verification commands CI runs, and the failures that pass locally and break in CI.
---

# Working on a docs page

## Where the rules live

`apps/docs/libraries-pin.json` names the commit of Evanion/libraries this site follows and the documents it follows there. Read its `sha` and fetch each document at `https://raw.githubusercontent.com/Evanion/libraries/<sha>/<path>`. Three of them divide the writing rules by subject:

- `docs/specs/2026-09-16-documentation-standard.md` decides structure: which page a thing belongs on, how a section stands alone, how support fades.
- `docs/specs/2026-09-20-public-documentation-guidance.md` decides sentences: person, tense, mood, paragraph and list length, terminology, notices, the refused words. Read it before writing prose.
- `docs/specs/2026-09-16-diagrams.md` decides how a diagram is authored. Where it and the standard disagree, it wins.

The pin names the others, and the reviewer agent (`.claude/agents/docs-reviewer.md`) lists what each covers.

`specs/2026-09-23-docs-site-design.md` is this site's spec. Section 3 amends the standard with the `concept` and `post` kinds, section 4 holds the inventory and the teaching order, section 5 the anatomy of each page kind, and section 7 the Starship Meridian. Read the sections that bear on the page you are touching. Do not work from a summary of them, and copy no part of them into anything else: a copy goes stale in the direction that reads as authoritative.

This file holds the procedure and the traps, and nothing the specs hold.

## Pick the work from the site spec's order

Section 18.1 item 3 lists the phase 1 pages in teaching order: Start, the Concepts, the Guides, Migration, then the error codes. Section 18.2 holds phase 2. A page written out of order gets rewritten when an earlier page changes what it may assume. If you are asked for a page, check where it sits in that order before starting. The examples a page cites live in `examples/meridian/src/pages/<slug>.md`; run them with `npx nx test @nexusdi/meridian`.

## Verifying

CI runs this, over every project, with no filter:

```
npx nx run-many -t lint test build typecheck
```

Run all four targets. You can scope with `--projects` while you iterate. A page is not done on a subset. The recurring failure is a local run of `test` alone reporting green on work that fails `typecheck`.

For a page that mounts the runtime (a console, the Playground, a mission), run the end-to-end suite as well:

```
npx nx e2e @nexusdi/docs-e2e
```

Then run `npx prettier --check .`. Prefix every nx and git command with `NX_NO_CLOUD=true NX_DAEMON=false`, or Nx Cloud can hang the command.

The Nx cache is trustworthy for the repo-checks guards: `nx.json`'s `repoChecks` named input hashes the workspace, so a docs edit runs them.

## Traps

Each of these wastes a round trip, and none shows up in the output of the command you were running.

### A stale `apps/docs/.next` serves the wrong page to the MDX loader

This is the first thing to suspect. Two symptoms, and either is enough: the build fails with one page's content parsed as another's and every error names a page that is fine, or an error names an absolute path inside a worktree you are not in. Run `rm -rf apps/docs/.next` and build again. If the second symptom stays, run `rm -rf .nx/cache` too.

### The Nx cache is shared across every worktree on the machine

`.nx/cache` is keyed on content, so a task another worktree ran can replay into yours. Treat a foreign path in the output as a cache hit, and suspect the cache before the code you just changed.

### A stale `libs/core/dist` reports the old signatures

The twoslash fences, the reference loader and the docs typecheck resolve `@nexusdi/core` through its published `exports`, which point at `libs/core/dist`. Against a stale build, a signature change looks like it did nothing. Run `npx nx build @nexusdi/core` first.

### The stash is shared across every worktree

`git stash` in a worktree writes to the same list as the main checkout, so a `git stash pop` can take an entry somebody else left. Never run `git stash`. Commit a temporary WIP commit and amend or reset it later.

### Content fences are empty in the source

A `ts file=… region=…` block has no body in the `.mdx`; the region loader fills it at build. Anything that reads the `.mdx` directly (a script, a grep for what an example shows) sees nothing. Expand regions first, or read the region's source.

### `twoslash` is the only other word a region fence may carry

`rehype-twoslash-popup` injects the `Popup` import when a fence's meta is exactly `twoslash`. The region loader strips the `file=… region=…` pair before Nextra reads the info string, so `ts twoslash file=libs/core/README.md region=quick-start` reaches rehype as plain `twoslash`. Any other word (`copy`, `filename=`, `showLineNumbers`) survives the loader and blocks the import, and MDX throws `Expected component Popup to be defined` at render. `doc-twoslash.test.ts` asserts the post-expansion meta.

### A `^?` query is the last line of its fence

The popup is absolutely positioned, so it covers the line after it.

### `.twoslash-query-presisted` is spelled that way upstream

It is twoslash's own spelling. If you correct it, the rule that gives a query room stops matching.

### `@errors:` is one-directional

Twoslash throws on an error the fence does not declare and says nothing when a declared error stops occurring. `tools/repo-checks/src/doc-twoslash.test.ts` closes the other direction. Keep that assertion when you touch the runner.

### A mermaid fence needs `caption="…"`

A guard fails the page without one. Nothing fails when a diagram describes a flow the code no longer has, so no fact lives only in a diagram.

### A link written as `/next/…` breaks at the swap.

Write root-relative links such as `/scopes/`. Next adds the base path on the `/next/` build and adds nothing on the root build after 0.4.0 final. `doc-links.test.ts` fails a hard-coded `/next/`.

### Console fixtures and seed JavaScript are built from `libs/core/dist`.

`docs:console-fixtures` and `docs:playground-types` run the seeds against the built core. After an engine change, rebuild core before you read a console or trust a fixture.

### A `mission.ts` edit that changes an objective raises `version`

The progress store keys every attempt by mission version. An objective edited without a version bump mixes attempts from two definitions in a reader's figures.

### A new decoy that passes its objective means the check is too weak.

Strengthen the check and keep the decoy. The `academy-missions` guard fails the mission until the decoy fails.

## Committing

Conventional commits with a scope from CONTRIBUTING.md: `docs` for `apps/docs`, `docs-e2e`, `meridian` for `examples/meridian`, `meridian-ui`, `doc-examples`. commitlint's `subject-case` rejects capitalised words in the subject, acronyms included.

## Reporting

Say which step of the site spec's section 18.2 the work belongs to, what you ran, and what you did not check. A page is done when the guards pass and the reviewer agent reports no defect; the standard's section 7 defines done, and its section 12 says which parts a test can reach.
