# The NexusDI documentation site

Status: approved design; implementation pending. The owner approved every decision in
section 2 in the design conversation of 2026-09-23. Section 19 lists the gaps that
conversation left open, each with a recommendation. Where the body depends on an open
question, it follows the recommendation and names the question.
Packages: `apps/docs` (new, `@nexusdi/docs`, private), `apps/docs-e2e` (new, Playwright),
`internal/meridian-ui` (new, private), `examples/meridian` (new, private),
`tools/doc-examples` (copied from the libraries repo), `tools/repo-checks` (extended). No
published package changes.
Depends on:

- `specs/2026-09-23-core-0.4-design.md` at `fb4510e`, the API this site teaches: §3 the
  public API and the Meridian names, §9 the error catalogue, §10 `graph()` and trace
  events, §11 the testing API, §13 the migration guide outline and the codemod, §14 the
  release plan and its rc.0 checklist.
- `chore/tooling-upgrade`: Nx 23, TypeScript 6.0.3, Vitest 4, nodenext ESM, the
  `@nexusdi/source` condition, `tools/repo-checks`, SHA-pinned CI actions. It deletes
  `docs/` and `.github/workflows/deploy-docs.yml` from the tree.
- The libraries repo (`Evanion/libraries`, local checkout
  `/Volumes/projects/Personal/open-source`) on `main`:
  `docs/specs/2026-09-16-documentation-standard.md` (the standard),
  `2026-09-20-public-documentation-guidance.md` (the sentence rules),
  `2026-09-13-interactive-examples.md`, `2026-09-16-diagrams.md`,
  `2026-09-13-released-by-default.md` and `2026-09-13-versioned-docs.md` (versioning),
  `2026-09-21-docs-api-reference.md`, `2026-09-22-docs-tests-per-export.md`,
  `2026-09-21-reference-page-budget.md` and `2026-09-12-baize-ui.md`, plus the code this
  spec copies or mirrors: `apps/docs`, `internal/baize-ui`, `tools/doc-examples`, the
  `doc-*` and `docs-*` guards in `tools/repo-checks/src`,
  `.claude/agents/docs-reviewer.md`, `.claude/skills/docs-page/SKILL.md` and
  `.github/workflows/docs.yml`.

Supersedes: `.github/workflows/deploy-docs.yml` on `main`, and the guide location in core
spec §13.1. The migration guide moves from `docs/docs/migration/0.3-to-0.4.md` to
`apps/docs/content/upgrade.mdx` (section 3.3). Core spec §15 hands the site structure to
this document.
Measured against: `main` at `6d5e4f3` for the live 0.3 site, `chore/tooling-upgrade` for
the repository layout, and the libraries repo's `main` for the stack it runs: Next 16.3.4,
Nextra 4.6.1, React 19.3.0, Pagefind ^1.5.2, twoslash 0.3.9, Tailwind 4.3.
Prior art: the libraries docs app, which this site copies system for system; react.dev's
Learn pages, which set a sandbox beside the prose; Svelte's tutorial, where the site
supplies the runtime and each lesson is a change to the previous lesson's code; the
TypeScript playground, which runs `@typescript/vfs` in a worker; Docusaurus versioning,
which serves the newest release at the bare path and older ones under a version segment.

## 1. Problem

nexus.js.org is a Docusaurus 3.8.1 build of `docs/` on `main`. Measured at `6d5e4f3`,
it has 34 documentation pages, 2 blog posts, 32,880 words and 302 code fences. No fence
executes. The pages teach the 0.3 API: `.set(` appears on 274 lines and `@Service` on 113.
The examples use a generic back-office domain, with `UserService` 164 times, `database`
103 times and `logger` 78 times.

0.4 replaces the API those pages teach (core spec §2). `set()`, `DynamicModule`, symbol
tokens and legacy parameter decorators are gone, and `get()` now sits behind a compiled,
sealed container. A page from the 0.3 site cannot be edited into a 0.4 page, because its
examples, its domain and its order all change.

`chore/tooling-upgrade` deletes `docs/` and `deploy-docs.yml`. After it merges, no
workflow can rebuild nexus.js.org, and GitHub Pages keeps serving the last artifact it
received. That workflow pins its actions by major tag (`actions/checkout@v4`), runs on
`lts/*` and checks nothing in its output.

0.3.1 has users on npm, and 0.4 is released as `0.4.0-rc.N` on the `next` dist-tag first
(core spec §14). During the RC a 0.3 user needs the 0.3 site at the address they know,
and an RC tester needs the 0.4 site and a migration path. At 0.4.0 final the two trade
places.

## 2. Decisions

1. Every page is re-evaluated and rewritten. The site keeps no 0.3 content. Every 0.3
   page teaches a removed API and none of its 302 fences executes, so no page meets the
   standard's fence rule (standard decision 11).
2. The site follows the libraries repo's documentation system: the standard, the public
   guidance, the loader chain and the guards. It has its own visual identity. The owner's
   writing rules apply to every page. The libraries system comes with tests for each of
   its rules, and a copy brings the tests along.
3. Migration is a first-class band with four pages (section 3.3). 0.3.1 has users, and
   the RC exists so those users can migrate and report problems before final.
4. The stack is Next 16 and Nextra 4 with `output: 'export'`, Pagefind, twoslash, a `.md`
   sibling per page, and the libraries loader chain: the region loader, the reference
   loader, the listing loader and the diagram loader. The app lives at `apps/docs`. GitHub
   Pages serves static files, and every loader in the chain is a Turbopack loader written
   for this stack.
5. `internal/meridian-ui` holds the design tokens (TypeScript source that generates CSS),
   the stateless components (the panel, the Ship note callout, the console frame) and the
   background module. It mirrors the `baize-ui` split: components read CSS custom
   properties, and `apps/docs/app/global.css` remaps Nextra's variables onto the Meridian
   tokens. The split keeps every React component stateless and lets the token test hold
   the CSS to the TypeScript values.
6. `tools/doc-examples` is copied from the libraries repo and owned here. The copy swaps
   the `@evanion/source` condition for `@nexusdi/source` and takes the reference loader's
   class prefix as an option. A shared package would tie two repositories' release
   cycles to one tool.
7. `tools/repo-checks` gains the libraries docs guards, adapted to one package, and one
   new guard that runs every Academy mission's seed and reference solution against its
   hidden tests (section 13.4). The guards turn the standard's buildable rules into CI
   failures from the first page onward.
8. The `docs-reviewer` agent and the `docs-page` skill are ported to `.claude/`, adapted to
   NexusDI (sections 13.5 and 13.6). They carry the rules no guard reaches.
9. The visual identity is direction D, "Deep space HUD": a deep navy nebula gradient from
   `#070a1c` to `#1a2150`, cyan `#5eeaff` and magenta `#ff5ec8` accents, glassy panels,
   thin geometric markers and Space Grotesk display type. "Ship note" is the domain
   notice label. The notice set is Note, Exception, Warning and Ship note, at most two a
   page (section 7).
10. The background is an animated nebula drift with slowly moving stars, written by hand
    as a WebGL2 module with a canvas 2D fallback. PixiJS is out. The module loads after
    the content, stops under `prefers-reduced-motion` and in hidden tabs, caps its frame
    rate on battery and when idle, and sits behind a reading surface that holds AA
    contrast (section 8).
11. The Starship Meridian is the one example domain across the site, with the vocabulary
    and mapping in section 6. Domain colour appears only in Ship notes, examples and page
    furniture, never in a sentence that states a rule. No humour and no idioms (public
    guidance decision 16).
12. The navigation order is Start, Concepts, Guides, Migration, API, Academy and
    Playground, with Blog outside the teaching path (section 3).
13. A concept page uses layout B, the sticky ship console: a narrow prose column and a
    console panel on the right that follows the section in view. On narrow screens the
    console collapses into inline specimens. The prose and fences teach the concept
    completely without the console (standard §5, the two-layer rule; section 9).
14. The console, the Playground and the Academy share one runtime: TypeScript 6.0.3 with
    `@typescript/vfs` in a Web Worker, emitted JavaScript running in an
    `<iframe sandbox="allow-scripts">` without `allow-same-origin`, an import map pointing
    at the workspace-built `@nexusdi/core`, a typed `postMessage` protocol and a
    CodeMirror 6 editor. Every seed comes from a doctested region (section 10).
    TypeScript 7 has no browser build, so the playground pins 6.x.
15. The graph and trace views render `graph()` JSON and trace events in custom SVG with a
    layered layout. Mermaid stays for static prose diagrams under the diagrams spec
    (section 11). Mermaid draws a static picture from about 500 kB of JavaScript, and the
    graph view has to redraw on every run.
16. The Academy at `/academy/` is nine missions that build the Meridian, one concept each,
    with the ship's code carried forward. Missions 1 to 3 use guided cards (option C);
    later missions use the briefing strip (option B). Every mission stays unlocked
    (section 12).
17. Academy progress lives in IndexedDB behind a small internal wrapper with no
    dependency. The schema stores raw events, so stars and ship-upgrade badges can be
    derived later without a data migration. Nothing leaves the browser (section 12.6).
18. During the RC the Pages deploy combines a frozen build of the 0.3 Docusaurus site at
    the root with the new site under `/next/`. CI builds the 0.3 snapshot once from
    `6d5e4f3` and stores it as a release asset. At 0.4.0 final the deploy swaps: the new
    site moves to the root and the snapshot moves to `/v0.3/` with a deprecation banner,
    for six months or until 0.5.0, whichever is later. No other archive exists before 1.0
    (section 14).
19. Delivery runs in two phases. Phase 1 runs beside the engine work: the app shell,
    `meridian-ui`, the background, `doc-examples`, the guards, the deploy pipeline and the
    playground runtime. Phase 2 starts once the 0.4 API passes review: the content, the
    API reference and the missions (section 17).
20. The landing page is the site's overview page and demonstrates the product with a live
    specimen: the Meridian graph coming online as the container initialises
    (section 4.1).
21. The site has a blog: MDX posts with a date, authors and tags, an index page, an Atom
    feed and `.md` siblings, under the same writing rules and the guards that apply to
    dated prose (section 5). The first post is the 0.4 RC announcement, published with
    rc.0 at `/next/blog/0-4-release-candidate/`, which core spec §14's rc.0 checklist
    item 1 requires.
22. The two 0.3 blog posts stay in the frozen 0.3 snapshot and are not migrated. They
    describe 0.3 APIs, and the snapshot already serves them at their original URLs.

## 3. Information architecture and page inventory

### 3.1 Navigation

The sidebar holds the documentation in five bands, each a separator in
`content/_meta.ts`: Start, Concepts, Guides, Migration and API. Start and Concepts form
the teaching path a reader walks from top to bottom. A reader enters Guides, Migration
and API with a goal already formed, which is the standard's arrival test (§2).

The navbar holds four entries in this order: Docs (to `/getting-started/`), Academy,
Playground and Blog. Search, the theme switch and the GitHub link follow them. Academy and
Playground are full-screen tools in an `app/(tool)` route group, the pattern the libraries
repo uses for `/matrix-explorer/`, so neither renders the docs chrome. Blog is a Nextra
`type: 'page'` entry, so it appears in the navbar and never in the sidebar.

URLs are flat. Standard decision 18 puts a separator at every level and a folder at none,
so `content/tokens.mdx` is served at `/tokens/`, and the Concepts band exists only in
`_meta.ts`. `content/blog/` is the one folder, and it sits outside the sidebar.

During the RC every path in this section sits under `/next/` (section 14).

### 3.2 Page kinds

Every page declares its kind in frontmatter (`kind: concept`). The guards read the field
(section 13.3), and the reviewer agent reads it to pick the rules that apply.

| Kind        | Standard page type                            | Executed regions      | Control    | Sequence |
| ----------- | --------------------------------------------- | --------------------- | ---------- | -------- |
| `overview`  | overview (`index`)                            | at least 1            | no         | entry    |
| `tutorial`  | getting started                               | every step            | required   | teaching |
| `concept`   | NexusDI amendment, open question 1            | at least 1            | one per H2 | teaching |
| `question`  | question page                                 | at least 1            | optional   | lookup   |
| `platform`  | platform guide                                | at least 1            | no         | lookup   |
| `contract`  | format or contract page                       | at least 1, or a link | no         | lookup   |
| `reference` | API reference (`api`)                         | 1 per callable export | no         | lookup   |
| `post`      | outside the standard; dated prose (section 5) | none required         | no         | none     |

Tool routes (`/playground/`, `/academy/` and the missions) are not content pages. The
libraries repo treats `/matrix-explorer/` the same way.

The standard's closed vocabulary gives a teaching page past the floor one kind, the setup
tier, capped at three. The approved IA has eleven concept pages, each introducing a
different mechanism. Open question 1 records the amendment this document follows: a
`concept` page carries the demonstration page's obligations (a full teaching layer, an
executed region, a control), and the three-tier cap does not apply because each concept
page adds a mechanism and none of them is a difficulty tier. The Concepts band fills the
standard's demonstration role as a whole.

### 3.3 Inventory

"Requires" is the prerequisites box (standard §2), which names at most the two pages
immediately before. Lookup pages carry no box and link to the page that teaches a
concept. "Control" names what the console shows (section 9) or the specimen the page
mounts.

| #   | Path                           | Title                                                                | Kind        | Introduces                                                                                                 | Requires                          | Control                                      |
| --- | ------------------------------ | -------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| 1   | `/`                            | NexusDI                                                              | `overview`  | what NexusDI is, when to use it and when to skip it                                                        | none                              | `MeridianOnline` specimen                    |
| 2   | `/getting-started/`            | Getting started                                                      | `tutorial`  | install, one module, `Nexus.create`, `get`, `await using`                                                  | none                              | console: graph of the first ship             |
| 3   | `/tokens/`                     | Tokens                                                               | `concept`   | a class as a token, `Token<T>`, identity comparison                                                        | Getting started                   | console: graph                               |
| 4   | `/providers/`                  | Providers                                                            | `concept`   | `provide()` forms: class with `deps`, `useValue`, `useFactory` sync and async, `useExisting`, `optional()` | Tokens                            | console: graph and a `NavCharts` specimen    |
| 5   | `/lifetimes/`                  | Lifetimes                                                            | `concept`   | `singleton` and `transient`                                                                                | Providers, Tokens                 | console: trace replay of two drones          |
| 6   | `/modules/`                    | Modules                                                              | `concept`   | `defineModule`, `imports`, `exports`, encapsulation, `get(T, { module })`                                  | Lifetimes, Providers              | console: graph with module visibility        |
| 7   | `/configurable-modules/`       | Configurable modules                                                 | `concept`   | `options`, `with()`, `schema`                                                                              | Modules, Lifetimes                | console: specimen of a frequency check       |
| 8   | `/scopes/`                     | Scopes and REQUEST                                                   | `concept`   | `createScope`, `scoped`, `REQUEST`, the captive rule                                                       | Configurable modules, Modules     | console: trace replay of two shuttles        |
| 9   | `/lifecycle/`                  | Lifecycle and disposal                                               | `concept`   | `onInit`, `Symbol.asyncDispose`, disposal order, `SuppressedError`                                         | Scopes and REQUEST                | console: trace replay of startup and scram   |
| 10  | `/lazy/`                       | Lazy edges and cycles                                                | `concept`   | `lazy()`, `NEXUS_CIRCULAR_DEPENDENCY`, `NEXUS_NOT_READY`                                                   | Lifecycle and disposal            | console: graph of the cycle and the lazy fix |
| 11  | `/multi-providers/`            | Multi-providers                                                      | `concept`   | `MultiToken`, `all()`                                                                                      | Lazy edges and cycles             | console: graph of the `DIAGNOSTICS` fan-in   |
| 12  | `/errors/`                     | Errors                                                               | `concept`   | `NexusError`, codes, one `BlueprintError` for every compile error                                          | Multi-providers                   | console: the error list of a broken Meridian |
| 13  | `/introspection/`              | Introspection and trace                                              | `concept`   | `graph()`, the `trace` callback                                                                            | Errors                            | `MeridianOnline` and a full trace replay     |
| 14  | `/node-request-scopes/`        | Scope an HTTP request in Node                                        | `platform`  | `nodeScopeContext`, `runInScope`, `currentScope`                                                           | none; links to Scopes and REQUEST | none: the unit is a running server           |
| 15  | `/react-router-ssr/`           | React Router server rendering                                        | `platform`  | the `examples/react-ssr` wiring                                                                            | none; links to Scopes and REQUEST | none: the unit is a running server           |
| 16  | `/testing/`                    | How do I replace a provider in a test?                               | `question`  | `createTestingContainer`, `override`, `overrideModule`                                                     | none                              | console: a test run                          |
| 17  | `/load/`                       | How do I add a module after startup?                                 | `question`  | `load()`                                                                                                   | none                              | console: trace replay of a load              |
| 18  | `/legacy-decorators/`          | How do I use NexusDI in a project that keeps experimentalDecorators? | `question`  | `NEXUS_LEGACY_DECORATORS` and the `provide()` path                                                         | none                              | none                                         |
| 19  | `/upgrade/`                    | How do I upgrade from 0.3 to 0.4?                                    | `question`  | core spec §13.1 steps 1 to 9                                                                               | none                              | none                                         |
| 20  | `/upgrade-api-map/`            | 0.3 to 0.4 API map                                                   | `contract`  | one H2 per 0.3 API, from core spec §13.1's table                                                           | none                              | none                                         |
| 21  | `/codemod/`                    | How do I run the 0.4 codemod?                                        | `question`  | the CLI, the report, one H2 per TODO and note code                                                         | none                              | none                                         |
| 22  | `/encapsulation/`              | Why does a provider stop resolving after upgrading to 0.4?           | `question`  | module encapsulation, seen from 0.3 code                                                                   | none                              | console: `NEXUS_NOT_VISIBLE`, then the fix   |
| 23  | `/api/`                        | `@nexusdi/core`                                                      | `reference` | one H2 per export of `.`, error classes excepted                                                           | none                              | none                                         |
| 24  | `/api-testing/`                | `@nexusdi/core/testing`                                              | `reference` | one H2 per export of `./testing`                                                                           | none                              | none                                         |
| 25  | `/api-node/`                   | `@nexusdi/core/node`                                                 | `reference` | one H2 per export of `./node`                                                                              | none                              | none                                         |
| 26  | `/api-errors/`                 | Error reference                                                      | `reference` | one H2 per error class, one H3 per code                                                                    | none                              | none                                         |
| 27  | `/blog/`                       | Blog                                                                 | `post`      | the post index                                                                                             | none                              | none                                         |
| 28  | `/blog/0-4-release-candidate/` | NexusDI 0.4 release candidate                                        | `post`      | the RC: what changed, the codemod, install, feedback, timeline                                             | none                              | none                                         |

Tool routes:

| #   | Path                  | What it is                                                      |
| --- | --------------------- | --------------------------------------------------------------- |
| T1  | `/playground/`        | The full-screen Playground, seeded by `?seed=<id>` (section 10) |
| T2  | `/academy/`           | The mission list with per-mission status (section 12)           |
| T3  | `/academy/<mission>/` | One route per mission, nine in all (section 12.1)               |
| T4  | `/academy/progress/`  | Progress, stats, export and reset (section 12.7)                |

Counts: 26 documentation pages (2 Start, 11 Concepts, 5 Guides, 4 Migration, 4 API), 2
blog pages, and 12 tool routes (the Playground, the Academy index, 9 missions and the
progress page). Open question 2 adds a Guides page for the decorator sugar if the owner
accepts it.

Two notes on the inventory.

The four Migration pages split core spec §13.1 in two. `/upgrade/` walks the steps, and
`/upgrade-api-map/` holds the mapping table as one H2 per 0.3 API, so a reader who
searches a 0.3 name reaches an anchor. Page 20 has about 45 entries and runs past the
1,200-word budget. G8 reports and does not fail (standard §4), and the page is recorded
in `doc-prose-budget.json` on the grounds `2026-09-21-reference-page-budget.md` gives for
a catalogue.

`/api-errors/` carries one H3 per `NexusErrorCode` member, so every code has a stable
anchor: `/api-errors/#nexus_missing_provider`. Core spec §9 promises that the docs link
each code to a page that explains it, and these anchors are those links.
`NEXUS_PROMISE_TOKEN` has no runtime class, so it sits under an H2 for the type-level
messages of `provide()`.

### 3.4 Teaching order and fading

`_meta.ts` order is the teaching order (standard decision 19). A concept introduced on
page N carries a short reminder on page N+1, a shorter one on N+2 and none from N+3
(standard decision 2). The reminder is a clause or a parenthesis. It never repeats the
explanation and never links away.

| Concept                              | Introduced on          | Short reminder on       | Shorter reminder on     |
| ------------------------------------ | ---------------------- | ----------------------- | ----------------------- |
| `Nexus.create`, `get`, `await using` | Getting started        | Tokens                  | Providers               |
| `Token<T>`                           | Tokens                 | Providers               | Lifetimes               |
| `provide()` and `deps`               | Providers              | Lifetimes               | Modules                 |
| `singleton`, `transient`             | Lifetimes              | Modules                 | Configurable modules    |
| `defineModule`, `exports`            | Modules                | Configurable modules    | Scopes and REQUEST      |
| `with()`, `options`                  | Configurable modules   | Scopes and REQUEST      | Lifecycle and disposal  |
| `createScope`, `scoped`, `REQUEST`   | Scopes and REQUEST     | Lifecycle and disposal  | Lazy edges and cycles   |
| `onInit`, disposal order             | Lifecycle and disposal | Lazy edges and cycles   | Multi-providers         |
| `lazy()`                             | Lazy edges and cycles  | Multi-providers         | Errors                  |
| `MultiToken`, `all()`                | Multi-providers        | Errors                  | Introspection and trace |
| error codes, `BlueprintError`        | Errors                 | Introspection and trace | none                    |

Lookup pages sit outside this order. A question page, a platform guide, a contract page
or a reference page may name any concept and links to the page that introduces it.

## 4. Page anatomy per page type

Rules shared by every content page come first, then each kind.

### 4.1 Shared rules

Frontmatter carries `title`, `kind`, `description` (one sentence, used for search results
and the `<meta>` description) and, on a teaching page, `requires` (a list of at most two
page slugs, rendered as the prerequisites box). The box renders above the first H2 as
page furniture. Body prose never sends a reader to another page in the middle of a
teaching page (standard §2).

A page has exactly one `# ` heading. Its first sentence names the page's subject and
states what the subject does (public guidance decision 21). On a concept page the concept
is the grammatical subject of that sentence.

Every H2 section stands alone when cut out: no pronoun that reaches back past its own
heading, a heading that names NexusDI or the symbol where the heading alone would be
ambiguous, and each fact next to the sentence that uses it (standard §5a).

Every TypeScript fence is a `file=… region=…` reference to a doctested region, a
`twoslash` fence, or a fence carrying one of the five exemption tags (`signature`,
`no-run`, `anti-example`, `fails-type-check`, `elided`). A shell fence is allowed. The
listing loader wraps a tagged fence in `<Listing>` so the reader sees that nothing ran it
(standard §5).

A page carries at most two notices and never two adjacent ones. The labels are `Note`,
`Exception`, `Warning` and `Ship note` (public guidance decisions 7 and 8, with `Shop note`
renamed). A Ship note may carry Meridian narrative. It never states a rule that the
prose around it does not also state.

A diagram is a `mermaid` fence with a `caption` (the diagrams spec), coloured from the
Meridian tokens through the libraries repo's sentinel mechanism in `Diagram.tsx`. The
diagram never carries a fact the prose leaves out.

During the RC every page carries a release notice above its H1: "This page documents
`@nexusdi/core` 0.4.0-rc.N. The documentation for 0.3.1, the current release, is at
nexus.js.org." The notice reads the newest `core@*` tag at build time, on the pattern of
the libraries repo's `release-state.ts`.

### 4.2 Overview: the landing page

The landing page is `content/index.mdx`, rendered with `theme: { layout: 'full',
sidebar: false, toc: false }` in `_meta.ts`. It is a content page, so it gets a `.md`
sibling, Pagefind indexing and every guard, and it follows the standard's overview rules:
what NexusDI is in two sentences, one executed region, when to reach for it, when not to,
and links to Getting started, Concepts, the upgrade guide and the API reference.

The proposal, top to bottom. Items marked [design pass] are placeholders for the visual
design pass.

1. The H1 "NexusDI" and a two-sentence definition. A draft: "NexusDI is a dependency
   injection container for TypeScript that checks the whole module graph when the
   container starts. After startup every `get()` is synchronous, and every wiring
   mistake has already been reported with the fix." [design pass: type size, the lockup
   with the logo]
2. The live specimen, `MeridianOnline`, beside the executed region that it runs. The
   region is `await using ship = await Nexus.create(Meridian)` over the Meridian modules.
   The specimen replays the trace events of that call once on the graph view: providers
   light up level by level as `construct` events arrive, `init` events mark each
   singleton ready, and the panel ends on the full graph. The first replay uses the
   build-time fixture (section 9.3). "Replay" runs the region again in the shared runtime
   (section 10) and replays the events that run produced. Under `prefers-reduced-motion`
   the specimen renders the final graph with no replay. The server renders the final
   graph from the fixture, so a reader without JavaScript sees the same end state. An
   "Edit this in the Playground" link sits under it. [design pass: the panel frame, the
   glow on a node as it constructs]
3. "When to reach for it": an application with enough services that hand wiring hides
   mistakes until runtime, a server that needs per-request values, resources that must
   shut down in dependency order, and tests that replace one service without rebuilding
   the graph. [design pass: layout as cards]
4. "When to skip it": a script with a handful of objects, and a framework with its own
   container (NestJS, Angular), where NexusDI adds a second container beside the first.
5. Links to the four entry pages. [design pass: card treatment]

`MeridianOnline` is also mounted on `/introspection/`, so the specimen is reachable from
a section as standard decision 20 and G6 require.

### 4.3 Tutorial: Getting started

`/getting-started/` is the one page that assumes nothing beyond the overview. It shows
the install command (`npm install @nexusdi/core@next` during the RC), the TypeScript
settings the reader needs (TypeScript 5.4 or later, no `experimentalDecorators`), and one
path that works end to end: two classes, one `defineModule`, `Nexus.create`, a `get()`
and `await using`. Every step is an executed region. The page mounts one inline console
whose seed is the finished path, so the reader can run the code they just read.

### 4.4 Concept page

A concept page uses layout B (section 9). Its frontmatter sets `console: true`, which
makes the docs app's MDX `wrapper` render a two-column grid: the prose column at the
`measure` token's width, and the sticky console. The Nextra table of contents is off on
these pages, because the console takes the right column.

The shape:

1. The H1 names the concept. The first two sentences name it again as their subject and
   state what it does.
2. The prerequisites box.
3. H2 sections, each teaching one facet in prose, an executed region and, where the shape
   needs it, a captioned `mermaid` fence. Each H2 section carries one `<ConsoleView>`
   whose `caption` says what the view shows. On a wide screen the view renders in the
   sticky console. On a narrow screen it renders inline where the author placed it.
4. Up to two notices, one of which may be a Ship note.

A concept page ends when its last H2 ends. It carries no recap and no "next steps" prose.
Nextra's previous and next links sit below it as furniture.

### 4.5 Question page

The H1 is the question a reader types. The first line of the answer names the method.
The page carries no prerequisites box. Where it needs a concept explained, it links to
the concept page and does not re-teach it. A question page may mount a console, and the
inventory lists the three that do.

### 4.6 Platform guide

A platform guide documents how NexusDI is wired into one platform and links out for the
platform itself (the Astro scope fence the standard adopts in §3a). Code that needs a
running server carries `no-run`. The request handling that the server calls is a
doctested region: `examples/meridian` runs it in Node with a fake request object. The page
states once that the demonstrable unit is a running server, so a reader does not look for
a console.

### 4.7 Contract page

`/upgrade-api-map/` has one H2 per 0.3 API, spelled as the 0.3 symbol. Each entry holds
the 0.4 equivalent, the codemod's handling (automatic, a TODO code, or unchanged) and a
before-and-after pair of fences. The "before" fence cites the codemod fixture's
`input.ts` and the "after" fence cites its `output.ts` (core spec §13.2). The codemod's
own test runs both, so the page's 0.3 code is executed as the codemod input and its 0.4
code as the codemod output.

### 4.8 Reference page

The four API pages follow `2026-09-21-docs-api-reference.md`: one `## \`symbol\`` heading
per export, and under it one directive the reference loader expands:

```md
## `createTestingContainer`

<!-- reference @nexusdi/core/testing#createTestingContainer example=testing-override -->

Prose the author writes, which the loader never touches.
```

The loader emits the docblock's first paragraph as the summary, the rest in a collapsed
`<details>`, a `twoslash` signature fence from the published declarations, the behaviour
sentences the tests state under a `describe` of that name
(`2026-09-22-docs-tests-per-export.md`), and a `twoslash` example fence from the named
region. A client filter above the entries hides and shows server-rendered entries and
never unmounts one (docs API reference decision 18). Export kinds take a hue from a
`kind` token family in `meridian-ui` (docs API reference decisions 27 to 31, with
`--meridian-kind` as the bound property). Reference pages are exempt from G8 by filename
prefix `api` (reference page budget decision 4, adapted to four pages).

### 4.9 Blog post

Section 5.

### 4.10 Tool routes

The Playground and the Academy render full screen in `app/(tool)`, under the root layout's
fonts, theme and background and outside Nextra's `Layout`. Each carries a slim header with
the site name, a link back to the docs, the theme switch and the background pause switch
(section 15.1). Sections 10 and 12 give their contents.

## 5. Blog

The blog is `content/blog/`, entered from the navbar and outside the sidebar.
`content/_meta.ts` lists it as `blog: { type: 'page', title: 'Blog' }`, and
`content/blog/_meta.ts` sets `theme: { sidebar: false, toc: true, pagination: false }` for
every post.

A post is `content/blog/<slug>.mdx` with this frontmatter:

```yaml
title: NexusDI 0.4 release candidate
kind: post
date: 2026-10-01
authors: [evanion]
tags: [release, migration]
description: One sentence for the index, the feed and search results.
version: 0.4.0-rc.0
```

`authors` names keys in `content/blog/authors.ts`, which holds each author's display name
and GitHub handle. `version` is the NexusDI version the post describes, rendered under the
byline as "Written for NexusDI 0.4.0-rc.0". A post is dated prose and nobody edits it to
track later releases, so the version line tells a later reader which API its code shows.

The index page `content/blog/index.mdx` mounts `<PostList />`, a server component that
reads `getPageMap('/blog')`, takes each post's `frontMatter`, and renders the posts newest
first with title, date, authors, tags and description. Tags render as chips. A client
filter over the chips hides entries with `hidden` and never unmounts one, so Pagefind
indexes every entry. The site builds no per-tag pages while it has fewer than ten posts.

The feed is Atom 1.0 at `/blog/atom.xml`, written by `apps/docs/tools/blog-feed.mjs` in
`postbuild`, beside the `.md` sibling writer. The generator reads the same frontmatter the
index reads. Each entry carries the post's title, `date` as `published` and `updated`, the
authors, the tags as categories, the description as `summary` and an absolute `link`.
Entry ids are tag URIs (`tag:nexus.js.org,2026:blog/0-4-release-candidate`), so a feed
reader keeps one entry when the post moves from `/next/blog/` to `/blog/` at final. The
feed is written into `out/` after the build because the `[...mdxPath]` catch-all owns
every route in the app, the constraint the libraries repo's `.md` sibling writer records.

The guards apply to posts with three differences, each because a post is dated and never
updated:

- A post's TypeScript fences carry `no-run` or `elided`. Region references would change
  an old post's code when a region changes. G3 holds every post fence to that rule, with
  no allowance.
- G5 and the domain guard skip posts. The RC announcement names 0.3 APIs on purpose.
- Posts need no control and no prerequisites box.

The prose guards, G7 (links), the `.md` sibling check and the notice budget apply to posts
unchanged.

The first post is `content/blog/0-4-release-candidate.mdx`, published with rc.0 at
`/next/blog/0-4-release-candidate/` and moved to `/blog/0-4-release-candidate/` by the
swap at final. It covers what core spec §14's rc.0 checklist item 1 lists: what changed
and why, the codemod, how to install `@nexusdi/core@next`, the feedback channel, and the
timeline to 0.4.0 final.

The two 0.3 posts stay in the 0.3 snapshot (decision 22).

## 6. Example domain: the Starship Meridian

Every example in `apps/docs/content`, every doctested region a page renders, every console
seed and every Academy mission is set on the Starship Meridian (standard §6). Core spec §3
already writes its examples in these names, so the docs and the spec share one vocabulary.

### 6.1 Canonical vocabulary

An example draws from this list and invents no neighbour. The code lives in
`examples/meridian/src/ship/`, and the regions the pages cite come from that project.

| Thing                  | The name                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The ship               | The Starship Meridian. The root module is `Meridian`, which imports `Tactical`.                                         |
| The container          | `ship`, the variable that holds `await Nexus.create(Meridian)`.                                                         |
| Singletons             | `ShipComputer` and `ReactorCore`. `ShipComputer` takes `ReactorCore`.                                                   |
| A transient            | `SurveyDrone`. Every `get()` launches a new drone.                                                                      |
| A scope                | A shuttle launched from the bay: `await using shuttle = await ship.createScope({ request })`. Scope ids are `s0`, `s1`. |
| The per-scope value    | `MISSION`, a `Token<Mission>` built from `REQUEST`. A `Mission` is `{ id: 'survey-7', target: 'Kepler-442b' }`.         |
| A scoped class         | `FlightLog`, one log per shuttle.                                                                                       |
| An async factory       | `NAV_CHARTS`, a `Token<NavCharts>`, built by `link.download('charts/sector-7')` from a `SubspaceLink`.                  |
| Disposal               | A reactor scram: `ReactorCore[Symbol.asyncDispose]()` drops the control rods.                                           |
| Modules                | `Engineering`, `Tactical` and `Comms`. `Comms.with({ frequency: 1420 })` configures one, through `COMMS_OPTIONS`.       |
| The lazy cycle         | `ShieldGrid` and `PowerRouter`. `PowerRouter` takes `lazy(ShieldGrid)`.                                                 |
| A multi token          | `DIAGNOSTICS`, a `MultiToken<Diagnostic>` with `ReactorDiagnostic` and `hullDiagnostic`, read by `DiagnosticsPanel`.    |
| An optional dependency | `DiagnosticsPanel` takes `optional(SubspaceLink)` and receives `undefined` in `Engineering`.                            |
| Decorator sugar        | `Bridge`, with `@Inject(NAV_CHARTS) accessor charts`, in the `Command` module.                                          |
| Test doubles           | `FakeReactor`, `LoopbackLink`, `CommsStub`, `fakeCharts`, `passingDiagnostic`.                                          |
| A server request       | `IncomingRequest` with a `mission` field, handled by `dispatch(req)`.                                                   |

### 6.2 Where it binds

The domain binds on every teaching page, every question page, every platform guide, the
Academy and the Playground seeds. A reference page takes it as the default and may use a
shorter example where a Meridian noun makes the example longer than its point (standard
§6). Migration pages show 0.3 code as the codemod fixtures hold it, so their "before"
fences keep the 0.3 names.

Domain colour appears in three places: a Ship note, an example, and page furniture (a
console caption, a mission title, an Academy failure message). A sentence that states a
rule uses NexusDI's own terms. "A scoped provider is built once per scope" is a rule. "The
shuttle keeps its own flight log" is colour, and it goes in a Ship note or a caption beside
the rule. No page carries humour, an idiom, a holiday, a season or a sport, in prose, a
heading or an example (public guidance decision 16). A Meridian noun is a name and carries
no joke.

### 6.3 Per-concept mapping

| Concept page            | The Meridian example                                                                                            | What the console shows                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Getting started         | `ShipComputer` takes `ReactorCore` in one module.                                                               | The two-node graph.                                                                  |
| Tokens                  | `NAV_CHARTS` names the `NavCharts` interface. Two tokens described `'NavCharts'` stay distinct.                 | The graph with a class token and a `Token` node.                                     |
| Providers               | `ReactorCore` as a class, `NAV_CHARTS` by an async factory from `SubspaceLink`, an alias, a `useValue`.         | The graph with each provider kind marked, and the plotted course from `NavCharts`.   |
| Lifetimes               | Two `get(SurveyDrone)` calls launch two drones that share one `ShipComputer`.                                   | A trace replay: two `construct` events for the drone, one for the computer.          |
| Modules                 | `Engineering` exports `ShipComputer` and keeps `PowerRouter` private. `Tactical` imports `Engineering`.         | The graph grouped by module, with `NEXUS_NOT_VISIBLE` on a private token.            |
| Configurable modules    | `Comms.with({ frequency: 1420 })`, and a schema that rejects a negative frequency.                              | The validated options, then `NEXUS_INVALID_MODULE_OPTIONS` with the schema's issues. |
| Scopes and REQUEST      | Two shuttles with two missions, each with its own `FlightLog`, sharing the ship's `ShipComputer`.               | A trace replay with lanes `s0` and `s1`.                                             |
| Lifecycle and disposal  | `ShipComputer.onInit()` runs a self-test. `await using` ends in a reactor scram, after the computer shuts down. | A trace replay of `init` events and the reverse-order disposal.                      |
| Lazy edges and cycles   | `ShieldGrid` and `PowerRouter` form a cycle. `lazy(ShieldGrid)` breaks it.                                      | The cycle with `NEXUS_CIRCULAR_DEPENDENCY`, then the graph with a dotted lazy edge.  |
| Multi-providers         | `ReactorDiagnostic` and `hullDiagnostic` contribute to `DIAGNOSTICS`. `DiagnosticsPanel` reads `all()`.         | The fan-in of `all` edges into `DiagnosticsPanel`.                                   |
| Errors                  | A Meridian with a missing export, a cycle and a captive `MISSION`.                                              | One `BlueprintError` listing all three, each with its code and fix.                  |
| Introspection and trace | The full Meridian.                                                                                              | `MeridianOnline` and a full trace replay, with the `graph()` JSON beside it.         |

### 6.4 The abandoned domains

The domain guard (section 13.3) holds fences to a deny list of the nouns the 0.3 site
used, counted at `6d5e4f3`: `UserService`, `UserModule`, `UserRepository`,
`DatabaseService`, `DatabaseModule`, `EmailService`, `LoggerService`, `LoggingModule`,
`OrderService` and `AppModule`, plus the `I…Service` interface pattern. The same list holds
the 0.3 API names that 0.4 removes: `@Service`, `@Provider`, `DynamicModule`,
`createChildContainer`, `TokenType`, `ContainerException`, `NoProvider`, `configAsync`,
`forRoot` and `new Nexus()`. The Migration band and the blog are exempt, because both name
0.3 code on purpose.

## 7. Visual identity and tokens

Direction D, "Deep space HUD", sets the look: a deep navy field with a nebula drifting
behind glass panels, cyan and magenta signal colours, thin geometric markers and a
geometric grotesque for display type. `internal/meridian-ui` holds the tokens. Values
marked [design pass] are proposals the visual design pass may move, inside the contrast
floors this section sets.

### 7.1 The package

`internal/meridian-ui`, package `@nexusdi/meridian-ui`, mirrors `internal/baize-ui` (baize-ui
spec §§1 to 5):

- `src/tokens/*.ts` is the source. `tools/generate-tokens.ts` writes
  `src/tokens.generated.css`, which is committed, and `tokens-generated.test.ts`
  regenerates it and compares byte for byte.
- Four entries: `.` (the stateless components), `./tokens` (values, no React), `./styles.css`
  (the custom properties and component classes) and `./background` (the background
  module, section 8, no React).
- Components import only `createElement` and `Fragment` from `react`. A source scan and the
  packed-output check hold that allowlist (baize-ui spec §5).
- The tokens name the font families, and the package holds no font files. The docs app
  self-hosts the fonts through `next/font`.
- The package lives under `internal/`, outside `nx.json`'s `release.projects` (`libs/*`),
  so `nx release` never versions it. Its `package.json` carries `private: true`.

The components are `Panel` (the glass surface), `ShipNote` and the three other notices
through one `Notice` component with a `kind` prop, `ConsoleFrame` (the console's chrome:
a title row, a tab strip slot, a body slot) and `Marker` (the thin geometric marks: a
corner bracket, a tick rule and a lifetime glyph). A stateful piece, such as the console's
section tracking or the editor, belongs to the docs app (the baize-ui boundary rule).

### 7.2 Colour roles

Every text role sits on a reading surface, never on the background canvas. The dark
surface is `#0b1030` at 86% opacity with a backdrop blur. The contrast column is measured
against the worst composite: that surface over a pure white background pixel, which is
`#2d314d`. No nebula frame can put a brighter pixel behind the surface, so the floor holds
for every frame of the animation.

| Role               | Dark          | Light         | Dark contrast, worst composite | Light contrast on `#e6eaf7` |
| ------------------ | ------------- | ------------- | ------------------------------ | --------------------------- |
| `space-0` (ground) | `#070a1c`     | `#f4f6fc`     | n/a                            | n/a                         |
| `space-2` (ground) | `#1a2150`     | `#e6eaf7`     | n/a                            | n/a                         |
| `hull` (surface)   | `#0b1030` 86% | `#ffffff` 92% | n/a                            | n/a                         |
| `hull-raised`      | `#161d48` 92% | `#ffffff`     | n/a                            | n/a                         |
| `rule` (hairline)  | `#2a3470`     | `#cfd5ee`     | decorative only                | decorative only             |
| `control-border`   | `#6b78c8`     | `#8a93b8`     | 3.10:1                         | 3.02:1 on white             |
| `text`             | `#e8edff`     | `#0b1030`     | 10.85:1                        | 15.45:1                     |
| `text-secondary`   | `#aab4e0`     | `#3a4470`     | 6.22:1                         | 7.80:1                      |
| `text-tertiary`    | `#8e99cc`     | `#4f5a8a`     | 4.57:1                         | 5.53:1                      |
| `signal-cyan`      | `#5eeaff`     | `#006b85`     | 8.86:1                         | 5.08:1                      |
| `signal-magenta`   | `#ff5ec8`     | `#b0006e`     | 4.64:1                         | 5.69:1                      |
| `signal-amber`     | `#ffc75e`     | `#8a5a00`     | 8.19:1                         | 4.93:1                      |
| `status-pass`      | `#5effa8`     | `#0a7040`     | 9.86:1                         | 5.13:1                      |
| `status-fail`      | `#ff7b7b`     | `#b3261e`     | 5.05:1                         | 5.44:1                      |
| `nebula-violet`    | `#8b6cff`     | none          | background only                | n/a                         |

The light column is measured on `#e6eaf7`, the darkest light ground, which is darker than
any light surface composite, so the figures are floors.

The lifetime roles reuse the signal colours: `singleton` is cyan, `scoped` is magenta,
`transient` is amber, and a provider with no lifetime (a value or an alias) takes
`text-secondary`. The graph view never carries a lifetime by colour alone (section 11).

`meridian-ui`'s token test computes each ratio in this table from the values with the
WCAG 2.1 formula (the libraries repo's `contrast.ts`), with the dark surface composited
over white, and fails when a text role falls below 4.5:1 or `control-border` below 3:1.
The floor is written beside each value in the token file.

### 7.3 Type

| Token     | Size (rem) | Line height | Family        | Use                                    |
| --------- | ---------- | ----------- | ------------- | -------------------------------------- |
| `display` | 3.052      | 1.05        | Space Grotesk | the landing H1                         |
| `h1`      | 2.441      | 1.1         | Space Grotesk | page titles                            |
| `h2`      | 1.953      | 1.2         | Space Grotesk | section headings                       |
| `h3`      | 1.563      | 1.25        | Space Grotesk | subsections, reference codes           |
| `lead`    | 1.25       | 1.5         | IBM Plex Sans | the first paragraph of a page          |
| `body`    | 1.0        | 1.65        | IBM Plex Sans | prose                                  |
| `small`   | 0.875      | 1.5         | IBM Plex Sans | captions, notices                      |
| `micro`   | 0.8        | 1.4         | IBM Plex Mono | HUD labels, uppercase, tracked +0.08em |
| `code`    | 0.875      | 1.6         | IBM Plex Mono | fences, the editor, the console log    |

The scale is a major third (1.25) on a 16px root. Display type tracks tighter as it grows
(-0.02em at `h1` and above). Figures in the console and the Academy stats use tabular
numerals. [design pass: the body and mono families; Space Grotesk is fixed]

### 7.4 Spacing, radii, elevation, motion

The spacing scale has eight steps, in rem: `1` 0.25, `2` 0.5, `3` 0.75, `4` 1, `5` 1.5, `6` 2,
`7` 3, `8` 4. The prose `measure` is 64ch.

Radii by role: `panel` 14px, `control` 8px, `chip` 4px, `marker` 0. The geometric markers
are square-cornered on purpose, so a marker never reads as a control. [design pass]

Elevation has two steps. `glass` is a 1px inner hairline at `signal-cyan` 12% plus
`0 12px 32px -16px rgb(0 0 0 / 0.8)`. `raised` adds a second, tighter shadow for the
console and dialogs. Focus is a 2px `signal-cyan` ring at 2px offset in dark mode and
`#006b85` in light mode.

Motion has two tiers. Interaction motion (hover, focus, a disclosure opening) runs at 140ms
on `cubic-bezier(0.2, 0.8, 0.3, 1)`. Console motion (switching views, a trace step) runs at
200ms on the same curve. The background's periods are in section 8. Under
`prefers-reduced-motion: reduce` every duration is 0ms and the background renders one
static frame.

### 7.5 Light mode

Nextra keeps its light and dark toggle, and the site follows the reader's system setting by
default. Light mode is the same roles on a pale hull: the ground is a static gradient from
`#f4f6fc` to `#e6eaf7`, the surfaces are white at 92%, and the signal colours darken to the
ink values in section 7.2. The background module renders no nebula in light mode, so light
mode has one static ground and one set of contrast values to test. The geometric markers,
the glass panels and the layout stay, so a reader who switches themes stays on a site
they recognise.

### 7.6 The Nextra remap

`apps/docs/app/global.css` follows the libraries repo's three-surface remap:

1. `--nextra-bg` and the primary hue reach the theme through `<Head>` props, derived from
   the tokens in `app/meridian-theme.ts` (the libraries repo's `baize-theme.ts` pattern).
   The primary hue is `signal-cyan`'s in dark mode and its ink value's in light mode.
2. Tailwind v4's `gray`, `neutral` and `slate` steps map onto the Meridian roles, one
   mapping for the steps `nextra-theme-docs/dist/style.css` uses, read out of the installed
   stylesheet.
3. Headings take the display family through a rule scoped to the article.

The `meridian-ui` component classes read `--meridian-*` properties and nothing else.
`global.css` binds those properties per theme on `html` and `html.dark`, as the libraries
repo binds `--baize-*`.

## 8. Background module

The background is a nebula of soft cyan, magenta and violet clouds that drift and swell
very slowly, with a field of stars that also drifts. It sits behind every page as
decoration and carries no information.

### 8.1 Shape

`@nexusdi/meridian-ui/background` exports one function:

```ts
export function startBackground(
  canvas: HTMLCanvasElement,
  options: { seed?: number; theme: 'dark' | 'light' },
): { stop(): void; setTheme(theme: 'dark' | 'light'): void };
```

It imports no framework. The docs app mounts it from one client component in the root
layout, which places a `<canvas>` with `position: fixed; inset: 0; z-index: -1;
pointer-events: none` and `aria-hidden="true"`. The canvas takes no focus and receives no
events. It is fixed to the viewport, so it moves no content and adds no layout shift.

The renderer is WebGL2. One fragment shader draws the nebula as three layers of value
noise (four octaves at most), each tinted by one of the three cloud colours at low alpha,
into a render target at one quarter of the device pixels (half width, half height) that
CSS scales up. The upscale softens the clouds, which is the look the nebula wants. The
stars are 150 to 400 point sprites, scaled by viewport area, drawn in the same pass. When
WebGL2 is unavailable or the context is lost, the module draws one static frame with
canvas 2D (a radial gradient per cloud and the star field) and stops.

### 8.2 Motion

The clouds translate on periods of 120 to 240 seconds and swell in opacity on periods of
12 to 20 seconds. Stars drift at 0.5 to 3 CSS pixels a second, slower for dimmer stars.
Nothing moves fast enough to draw the eye while a reader is reading.

### 8.3 When it runs

- The module starts after the page's `load` event, inside `requestIdleCallback` (with a
  2-second timeout fallback), so the content paints first and the largest contentful
  paint never waits on it.
- Under `prefers-reduced-motion: reduce` it renders one frame and never starts a loop. It
  listens for the media query and stops or starts when the setting changes.
- In a hidden tab (`document.visibilityState === 'hidden'`) it cancels its frame request
  and clears its timers. It resumes on `visibilitychange`.
- It renders at 30 frames a second at most. With no pointer, key, scroll or touch event for
  30 seconds, it drops to 10. On battery, where `navigator.getBattery()` reports
  `charging: false`, it caps at 15. Browsers without the Battery API get the 30 cap.
- With `navigator.connection.saveData` set, it renders one frame and stops.
- In light mode it renders nothing and leaves the CSS gradient.

### 8.4 Budget

| Budget                                | Limit                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------ |
| JavaScript                            | 8 kB gzipped for the module, shaders included                            |
| Main-thread time                      | 1 ms a frame at the 30 fps cap, 3% of main-thread time over 10 seconds   |
| GPU                                   | one pass, a quarter-resolution target, at most four noise octaves        |
| Long tasks attributable to the module | none over 50 ms                                                          |
| Memory                                | one render target and one vertex buffer, no textures loaded from network |
| Network                               | none                                                                     |

CI measures the JavaScript size from the built chunk and the main-thread time from a
Playwright trace (section 16). GPU time is not observable in CI, so the GPU row is a set of
design limits the review holds.

## 9. Ship console

The ship console is the control on a concept page: the live graph, a specimen or a trace
replay for the section in view, with an "Edit this in the Playground" link.

### 9.1 Authoring

An author places one `<ConsoleView>` in each H2 section of a concept page:

```mdx
<ConsoleView
  seed="scopes/two-shuttles"
  view="trace"
  caption="Two shuttles each build their own MISSION and FlightLog, and share one ShipComputer."
/>
```

`seed` names a console seed (section 10.9). `view` is `graph`, `trace` or `specimen`.
`caption` is required and states what the view shows in words, so the teaching layer
carries the view's claim and a reader without JavaScript loses nothing (standard §5, the
two-layer rule). A guard fails a `ConsoleView` without a caption, as
`diagram-captions.test.ts` does for a diagram.

### 9.2 Behaviour

On a screen at least 1280 CSS pixels wide, the concept page renders a two-column grid. The
console panel sits in the right column with `position: sticky` below the navbar. An
`IntersectionObserver` over the H2 sections picks the section nearest the top of the
viewport, and the console shows that section's view. Above the first H2, the console shows
the first section's view. The switch animates at the console tier (200ms) and is instant under reduced
motion.

Below 1280 pixels, each `ConsoleView` renders inline at the position the author placed it,
as a specimen card with the same content.

The console's header shows the section heading it follows, a tab strip for the view kinds
the seed supports, a "Run" control and "Edit this in the Playground". Run executes the seed
in the shared runtime (section 10) and replaces the static view with the live result.
"Edit this in the Playground" links to `/playground/?seed=<seed>`.

### 9.3 Without JavaScript

The server renders each view from a build-time fixture. `apps/docs/tools/console-fixtures.mjs`
runs every console seed in Node against the workspace-built `@nexusdi/core`, records
`graph()`, the trace events and the console output, sets every `durationMs` to 0 so the
HTML is identical between builds, and writes one JSON file per seed. The graph and trace
views render that JSON to static SVG and markup. The live runtime loads only when the reader
presses Run or opens the editor.

### 9.4 Page weight

Nothing in the runtime loads before the reader interacts. The static views are SVG and
markup in the page's HTML. The console island, which does the section tracking, the tabs
and the trace replay, is limited to 35 kB gzipped (section 15.2).

## 10. Playground runtime

One runtime serves the console, the Playground and the Academy. It lives in
`apps/docs/components/runtime/`, and each surface mounts it with a different frame.

### 10.1 Architecture

```
 page (nexus.js.org)                          Web Worker (same origin)
 ┌──────────────────────────────┐   files    ┌───────────────────────────────┐
 │ CodeMirror 6 editor          │ ─────────▶ │ TypeScript 6.0.3              │
 │ console / graph / trace view │ ◀───────── │ @typescript/vfs environment   │
 │ run controller               │ diagnostics│ type-check, transpile, rewrite│
 └──────────────┬───────────────┘ + JS       └───────────────────────────────┘
                │ srcdoc: import map + CSP + harness
                ▼
 ┌──────────────────────────────┐
 │ <iframe sandbox="allow-scripts">  opaque origin, one per run
 │ harness → @nexusdi/core (runtime/core-<hash>/)
 │ user modules as data: URLs
 └──────────────┬───────────────┘
                │ postMessage (protocol v1)
                ▼
          run controller
```

The editor sends the reader's files to the worker. The worker returns diagnostics and
emitted JavaScript. The run controller builds a fresh sandboxed iframe for each run, and
the iframe reports back over `postMessage`. The worker never runs the reader's code, and
the iframe never sees TypeScript.

### 10.2 The TypeScript worker

The worker bundles `typescript@6.0.3`, the version the workspace pins, and
`@typescript/vfs`. Next's bundler emits it as its own chunk through
`new Worker(new URL('./ts.worker.ts', import.meta.url))`, so no page loads it until the
runtime creates the worker. A test asserts that the worker's `ts.version` equals the root
`package.json`'s `typescript` version.

The worker builds one `createVirtualTypeScriptEnvironment` per editor session over the
bundled declarations (section 10.3) and the reader's files. On every change, debounced to
300 ms, it returns the semantic and syntactic diagnostics for every file. The editor draws
them as squiggles through `@codemirror/lint`, with the message and the code on hover and in
the lint panel.

On Run, the worker transpiles each file with the same compiler options and a custom
transformer that rewrites relative imports between the reader's files (`./engineering.js`)
into bare specifiers (`@ship/engineering`). It also instruments every loop and function
body with the guard call section 10.6 describes. It emits inline source maps so a runtime
stack maps back to editor lines.

The compiler options live in one module, `apps/docs/components/runtime/compiler-options.ts`:
`target: 'es2022'`, `module: 'esnext'`, `moduleResolution: 'bundler'`, `strict: true`,
`lib: ['es2023', 'esnext.disposable', 'dom']`, no `experimentalDecorators`. The twoslash
fences on the site compile with the same options, and a test asserts that both read this
module.

### 10.3 Declarations

`apps/docs/tools/playground-types.mjs` runs before `next build`. It collects the
TypeScript lib files the options above name, following each `/// <reference lib>` chain in
`node_modules/typescript/lib`, and the published declarations of `@nexusdi/core` and
`@nexusdi/core/testing` from `libs/core/dist`. It writes one JSON file,
`public/runtime/types-<hash>.json`, mapping each virtual path to its contents. The hash is
the SHA-256 of the contents, so a new core build or a TypeScript bump changes the URL.

`@nexusdi/core/node` is left out. It imports `node:async_hooks`, which no browser has, so
the Node request guide keeps its server code in doctested regions that run in Node.

### 10.4 The sandbox

The run controller creates a new iframe for every run:

```html
<iframe sandbox="allow-scripts" srcdoc="…"></iframe>
```

The `sandbox` attribute carries `allow-scripts` and nothing else. Without
`allow-same-origin` the frame has an opaque origin, so it cannot read the docs site's DOM,
cookies, `localStorage` or IndexedDB, which holds the Academy progress. Without
`allow-top-navigation`, `allow-popups`, `allow-forms` and `allow-modals`, it cannot
navigate the page, open a window, submit a form or block on `alert()`.

The `srcdoc` document holds three things:

1. A `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'`,
   `script-src <origin> data: 'sha256-<import map hash>'` and `connect-src 'none'`, where
   `<origin>` is the parent's `location.origin`. CSP treats an inline import map as an
   inline script, so the parent hashes the map with `crypto.subtle` and allows that one
   hash. The frame can load the runtime and the reader's modules and can make no network
   request.
2. An import map:

   ```json
   {
     "imports": {
       "@nexusdi/core": "https://nexus.js.org/next/runtime/core-<hash>/harness.js",
       "@nexusdi/core/testing": "https://nexus.js.org/next/runtime/core-<hash>/testing/index.js",
       "@ship/engineering": "data:text/javascript;base64,…",
       "@ship/main": "data:text/javascript;base64,…"
     }
   }
   ```

   The parent writes the URLs from its own `location.origin` and the build's base path
   (`/next` during the RC). `runtime/core-<hash>/` is a copy of `libs/core/dist` made by
   `apps/docs/tools/runtime-assets.mjs` before `next build`, so the code a reader runs is
   the code the workspace built and tested at that commit. No example loads anything from
   npm. Core's build emits ESM with explicit `.js` extensions (`4929328`), so the browser
   loads its relative imports as they are.

3. `<script type="module" src="<origin><basePath>/runtime/core-<hash>/boot.js">`, which
   imports `@ship/main` and reports results. Apart from the hashed import map the document carries
   no inline script, so the CSP needs no `'unsafe-inline'`.

`harness.js` re-exports `@nexusdi/core` with one change: it exports a `Nexus` subclass
whose static `create` passes a `trace` callback that posts every event, chains the
reader's own `trace` option, and posts `ship.graph()` after `create` resolves and after
every `load()` (it watches for `compile` events with `phase: 'load'`). The reader's types
come from the real declarations, and the harness changes no behaviour a reader can
observe apart from the reports.

The frame's module fetches carry `Origin: null`. GitHub Pages answers every request with
`Access-Control-Allow-Origin: *`, which satisfies a CORS module fetch from an opaque
origin. Phase 1 verifies this against the deployed site in Chromium, Firefox and WebKit
(section 17.1).

### 10.5 The message protocol

The frame posts messages to the parent. The parent posts nothing after it creates the
frame, because the `srcdoc` carries everything the run needs.

```ts
type RunnerMessage = { v: 1; runId: string } & (
  | { type: 'ready' }
  | {
      type: 'console';
      level: 'log' | 'info' | 'warn' | 'error';
      args: SerializedValue[];
    }
  | { type: 'trace'; event: TraceEvent }
  | { type: 'graph'; graph: NexusGraph }
  | {
      type: 'test';
      objectiveId: string;
      status: 'pass' | 'fail';
      message?: string;
    }
  | {
      type: 'error';
      phase: 'runtime' | 'timeout' | 'loop';
      name: string;
      code?: string;
      message: string;
      stack?: StackFrame[];
    }
  | { type: 'heartbeat' }
  | { type: 'done'; durationMs: number }
);
```

`TraceEvent` and `NexusGraph` are core's own types (core spec §10). `SerializedValue`
renders a value for the console log: primitives as they are, a class instance as its class
name and own enumerable fields to depth 3, a function or class as `[class ShipComputer]`,
a `NexusError` with its `code`. The harness serializes before posting, so the message
structured-clones.

The parent accepts a message only when `event.source` is the current run's
`contentWindow`, `v` is 1, `runId` matches, and a hand-written type guard accepts the
shape. It drops anything else. It renders every string as text and never as HTML. It caps
a run at 1,000 console entries and 256 kB of serialized payload, then drops further
messages and shows that it did.

### 10.6 The kill switch

A sandboxed frame may share the parent's thread, depending on the browser's process
model, so an infinite loop in the frame could freeze the page. Three layers stop it.

1. The loop guard. The worker's transformer inserts `__guard()` at the top of every loop
   body and every function body. `__guard` compares `performance.now()` with the start of
   the current macrotask turn, and throws a `RunawayError` when one turn has run for
   more than 1,000 ms. The harness resets the turn start from a `setTimeout(0)` heartbeat,
   so a chain of microtasks that never yields also trips it. The error reaches the parent
   as `{ type: 'error', phase: 'loop' }` with the editor line.
2. The wall clock. A run that sends no `done` within 10 seconds (the Academy uses 5
   seconds per objective) is ended: the controller removes the iframe and reports
   `phase: 'timeout'`.
3. The watchdog. The harness posts a heartbeat every 250 ms. When the parent sees no
   heartbeat for 2 seconds, it removes the iframe. This layer covers a browser that runs
   the frame on its own thread and a loop the guard cannot see.

When the controller removes the iframe, the browser ends everything the run started. The
next run builds a new frame, so no state carries between runs.

### 10.7 Load budget and caching

| Asset                        | Gzipped | Loads when                               |
| ---------------------------- | ------- | ---------------------------------------- |
| Console island               | 35 kB   | the page hydrates                        |
| CodeMirror 6 and its TS mode | 150 kB  | the reader opens an editor               |
| TypeScript worker            | 1.7 MB  | the first edit, or Run on an edited file |
| Declarations JSON            | 400 kB  | with the worker                          |
| Core runtime copy            | 30 kB   | the first Run                            |

TypeScript is about 1.6 MB gzipped, so it loads on first interaction.
`playground-types.mjs` emits every seed's JavaScript at build time, so Run works on an
unedited seed before the worker arrives. An edit starts the worker download, and the
editor shows "Loading the type checker" until the first diagnostics return.

Every runtime asset has a content hash in its URL, so a deploy that changes an asset
changes its URL and a deploy that changes nothing leaves every URL as it was. GitHub Pages
sends `Cache-Control: max-age=600` with an `ETag`. Within ten minutes the browser reuses
the cached worker with no request. After that it sends a conditional request, and Pages
answers `304 Not Modified` without the body. The runtime adds no service worker and no
Cache Storage layer.

### 10.8 The editor

CodeMirror 6 with `@codemirror/lang-javascript` in TypeScript mode, `@codemirror/lint` for
the diagnostics, and a tab strip when a seed has more than one file. `Tab` indents inside
the editor, and `Escape` followed by `Tab` moves focus out, which the editor's accessible
label states. The Playground offers Run, Reset to seed, and a file tab per module. The
console and the Academy use the same editor component with fewer controls.

### 10.9 Seeds

A seed is a named, runnable program: one or more files and the entry file. The registry
is `apps/docs/components/runtime/seeds.ts`, which maps a seed id such as
`scopes/two-shuttles` to `{ files: [{ path, file, region }], entry }`. Every file comes from
a doctested region in `examples/meridian` or `libs/core/README.md` through the region
parser, so the editor starts on code a test ran.

`tools/repo-checks/src/doc-seeds.test.ts` asserts each seed: every region exists, every
file the region comes from sits in a Vitest project's include set, the files type-check
with `compiler-options.ts`, and the seed runs in Node against the workspace core and
produces the graph and trace fixture `console-fixtures.mjs` wrote. A `ConsoleView`,
a Playground link or an Academy mission that names an unknown seed fails the same test.

The Playground reads `?seed=<id>` on the client. A link carries a seed id and never a code
string, so no link can make another reader's browser run code the site did not build and
test (the libraries interactive-examples spec §6).

### 10.10 Security model

- The reader's code runs only in a sandboxed iframe with an opaque origin and a CSP that
  forbids network requests. It cannot reach the docs origin's DOM or any of its storage.
- The worker runs TypeScript, which parses and checks code and never executes it.
- The parent validates every message and renders every value as text.
- A seed id names code the site built and tested. The site has no share-by-code link.
- nexus.js.org sets no cookies and stores only the theme preference in `localStorage` and
  the Academy progress in IndexedDB, and the frame can reach neither.
- The worst a reader can do is freeze their own frame, which the kill switch ends.

## 11. Graph and trace views

Both views render core's own data: `NexusGraph` from `ship.graph()` and `TraceEvent`s from
the `trace` callback (core spec §10). They live in `apps/docs/components/graph/` as React
components over pure layout and replay functions that the unit tests call directly.

### 11.1 The graph view

The layout is layered. Providers are nodes and edges are dependencies.

1. Layers. A provider's layer is the length of the longest path from it to a provider
   with no dependencies, over every edge kind except `lazy`. This matches core's own level
   rule (core spec §5, pass 6), so the picture puts each provider where the build order
   puts it. Layer 0 is at the bottom and consumers sit above their dependencies.
2. Order within a layer. Four barycenter sweeps reduce crossings, and ties break by
   provider id, so the same graph always draws the same way.
3. Edges. `lazy` edges route as curves outside the layer order, drawn dotted with an open
   arrowhead, so a cycle broken by `lazy()` reads as a loop with one soft link.

Each node is a thin-bordered rectangle holding the token's display name, the module name
beneath it, and a lifetime glyph with a text label: `singleton`, `scoped`, `transient`, or
`value` and `alias` for a provider with no lifetime. The glyph and the border take the
lifetime colour (section 7.2), so colour repeats the label and never replaces it. A factory
node whose `async` is `true` carries a small clock mark.

| Edge kind  | Stroke                                            |
| ---------- | ------------------------------------------------- |
| `required` | solid, filled arrowhead                           |
| `optional` | dashed, filled arrowhead                          |
| `lazy`     | dotted, open arrowhead, routed outside the layers |
| `all`      | double line, a count badge at the target          |
| `alias`    | thin solid with an `=` marker at the midpoint     |

A module filter chip row above the graph dims the providers outside the chosen modules. A
compile error from the run marks the named providers with `status-fail` and lists the
errors under the graph.

The SVG carries `role="img"` and an `aria-labelledby` pointing at the view's caption. A
`<details>` under it holds the same graph as two tables, providers and edges, rendered on
the server. Pan and zoom use the SVG `viewBox`, driven by drag, the wheel, and the
keyboard (`+`, `-`, the arrow keys, `0` to reset). A Meridian graph has about 15 nodes. The
layout targets 60 nodes before it needs clustering, which is out of scope (section 18).

### 11.2 Trace replay

The replay steps through a recorded list of events on top of a graph view.

- `construct` lights its provider's node, in the scope lane named by `scope` when the value
  is a scope id.
- `init` marks the node ready.
- `scope:create` opens a lane labelled with the scope id. `scope:dispose` closes it.
- `dispose` walks the nodes in the order disposal ran, which is reverse creation order
  (core spec §8.2).
- `untracked` marks the transient with a `Warning` label: nothing disposes it, and the
  replay says so in words.
- `compile` shows the provider and module counts and any error count.

The controls are previous, play or pause, next, a scrubber and a speed switch (0.5×, 1×,
2×). At 1× a step takes 600 ms. The replay uses a fixed step because a recorded
`durationMs` measures the machine that ran it and says nothing about the concept. The live
run shows the real durations in the event list. An `aria-live="polite"` region announces
each step as a sentence ("ShipComputer constructed in scope s0"). Under reduced motion the
replay opens paused on the final state, and each step changes the highlight with no
animation.

### 11.3 Mermaid

Prose diagrams stay `mermaid` fences under the libraries diagrams spec: a required
`caption`, one `:::accent` node, the colours replaced by `var(--meridian-*)` properties
through the sentinel mechanism, and a lazy import of Mermaid inside an
`IntersectionObserver`. A Mermaid diagram draws a flow the prose describes, such as the
six compile passes or the disposal order. It never draws a `graph()` result, which the
graph view owns.

## 12. Academy

The Academy at `/academy/` is a sequence of missions that build the Starship Meridian, one
concept each. The reader writes the ship's code in the editor and runs the checks, and the
ship's code carries forward into the next mission.

### 12.1 Missions

Each mission follows the concept page it practises, in the same order. Missions 1 to 3 use
guided cards (layout C) while the reader learns the Academy's controls. Missions 4 to 9
use the briefing strip (layout B). Every mission stays unlocked.

| #   | Id                     | Title             | Practises              | Objectives                                                                                                                    | A failure message                                                    | Layout |
| --- | ---------------------- | ----------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| 1   | `01-first-light`       | First light       | Tokens                 | `NAV_CHARTS` is a `Token<NavCharts>`; the bridge reads the charts through `get(NAV_CHARTS)`                                   | "The bridge asked for NavCharts, and no provider answered."          | C      |
| 2   | `02-chart-room`        | Chart room        | Providers              | `ShipComputer` receives `ReactorCore` through `deps`; `NAV_CHARTS` comes from an async factory over `SubspaceLink`            | "NavCharts was built from a value, and the charts never downloaded." | C      |
| 3   | `03-drone-bay`         | Drone bay         | Lifetimes              | two `get(SurveyDrone)` calls launch two drones; both drones share one `ShipComputer`                                          | "Both launches returned the same SurveyDrone."                       | C      |
| 4   | `04-decks`             | Decks             | Modules                | `Engineering` exports `ShipComputer`; `PowerRouter` stays private; `Tactical` resolves `ShipComputer`                         | "Tactical asked for ShipComputer, and Engineering keeps it private." | B      |
| 5   | `05-open-channel`      | Open channel      | Configurable modules   | `Comms.with({ frequency: 1420 })` opens the link; the schema rejects a negative frequency                                     | "Comms accepted frequency -3."                                       | B      |
| 6   | `06-shuttle-launch`    | Shuttle launch    | Scopes and REQUEST     | each shuttle reads its own `MISSION`; each shuttle keeps its own `FlightLog`; no singleton holds a `MISSION`                  | "FlightLog was built once for two shuttles."                         | B      |
| 7   | `07-scram-drill`       | Scram drill       | Lifecycle and disposal | `ShipComputer.onInit` finishes its self-test before `create` resolves; the reactor scrams once, after the computer shuts down | "The reactor scrammed before the computer shut down."                | B      |
| 8   | `08-power-loop`        | Power loop        | Lazy edges and cycles  | the ship starts with `ShieldGrid` and `PowerRouter` both registered; `PowerRouter.divert()` reaches the grid                  | "ShieldGrid and PowerRouter each waited for the other."              | B      |
| 9   | `09-diagnostics-sweep` | Diagnostics sweep | Multi-providers        | `Engineering` and `Tactical` each contribute a diagnostic; `DiagnosticsPanel` receives both through `all()`                   | "DiagnosticsPanel saw one diagnostic of two."                        | B      |

The Errors and Introspection pages have no mission. Every mission surfaces both: a failed
check shows the `NexusError` code the run produced, and the console shows the graph and the
trace of every run. A later mission set can add them (section 18).

### 12.2 A mission's files

Each mission is a directory `apps/docs/academy/<id>/` with two files.

`briefing.mdx` is the text: the mission's goal in one paragraph, the concept it practises
with a link to the concept page, and one short paragraph per objective. The prose guards
apply to it, and the reviewer agent reads it. It is not a Nextra content page, because the
Academy route renders it inside the mission layout, so the floor and control guards skip it.

`mission.ts` is the data:

```ts
import type { Mission } from '../mission-types';

export default {
  id: '06-shuttle-launch',
  version: 1,
  title: 'Shuttle launch',
  practises: 'scopes',
  layout: 'briefing',
  seed: { files: [...], entry: 'main.ts' },
  solution: { files: [...], entry: 'main.ts' },
  objectives: [
    {
      id: 'flight-log-per-shuttle',
      title: 'Each shuttle keeps its own FlightLog',
      teaches: true,
      guided: false,
      check: async ({ ship, exports: { FlightLog } }) => {
        await using a = await ship.createScope({
          request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
        });
        await using b = await ship.createScope({
          request: { mission: { id: 'survey-8', target: 'Gliese-667Cc' } },
        });
        return a.get(FlightLog) === b.get(FlightLog)
          ? { status: 'fail', message: 'FlightLog was built once for two shuttles.' }
          : { status: 'pass' };
      },
    },
  ],
  hints: [
    { id: 'lifetime', objectiveId: 'flight-log-per-shuttle', text: 'A provider that belongs to one shuttle takes a lifetime of its own.' },
  ],
} satisfies Mission;
```

`seed` and `solution` list files by region, `{ path: 'tactical.ts', file:
'examples/meridian/src/academy/06-shuttle-launch/seed/tactical.ts', region: 'tactical' }`,
so every editor seed comes from a region in a tested project. `version` rises when an
objective changes, and the progress store keys attempts by it (section 12.6).

A `check` receives `ship`, the container the reader's `main.ts` exports
(`export const ship = await Nexus.create(Meridian)`), `exports`, the reader's other
exports from every file, and `core`, which holds `@nexusdi/core` and
`@nexusdi/core/testing`. Each objective's briefing paragraph names the exports its check
reads, so the reader knows the contract. After the last check the harness disposes `ship`.

The objectives are "hidden" in the sense that the UI shows their titles and results and
never their code. The site is static, so a reader who opens the built JavaScript can read
them. The Academy states this on its index page.

### 12.3 Layouts

Layout B, the default: a briefing strip across the top holds the mission title, one
paragraph and the objective list with a status marker per objective. The strip collapses to
one line. The editor fills the left and the shared console (section 9) fills the right,
showing the graph and trace of the last run. The action row holds Run checks, Hint, Reset
and the stats.

Layout C, the guided mode: one card over the editor shows one objective at a time, with the
step's instruction and a Check button. The card moves to the next objective when the check
passes. Missions 1 to 3 run entirely in layout C. A later mission marks a single objective
`guided: true` to show a card for one difficult step inside layout B.

### 12.4 Carrying the ship forward

Mission N's seed is mission N−1's reference solution plus the files mission N adds. When
the reader passed mission N−1 in this browser, the mission offers two starts: "Continue
with your ship", which loads the reader's last passing code from mission N−1 and adds
mission N's new files, or "Start from the reference ship". A mission never edits a file the
reader wrote. Before the first run, a precheck compiles the carried code and lists any
export mission N's objectives read that the carried code lacks, and offers the reference
ship. A reader who opens mission N first gets the reference ship.

### 12.5 Runtime

The Academy runs on the shared runtime (section 10). `apps/docs/tools/academy-runtime.mjs`
compiles each `mission.ts` into `public/academy-runtime/<id>-<hash>.js`, and the import map
of an Academy run adds `@academy/checks` for it. When the import map carries that entry,
`boot.js` imports the reader's `main.ts` and then runs each objective's `check` in
declaration order, each under the 5-second limit, posting a `test` message per objective. A check that throws posts `fail` with the thrown
error's code and message.

### 12.6 Progress schema

Progress lives in IndexedDB, database `nexusdi-academy`, behind
`apps/docs/components/academy/store.ts`: about 150 lines that wrap `IDBRequest` and
`IDBTransaction` in promises, with no dependency.

| Store              | Key                        | Indexes                               | Record                                                                                                                                                                                        |
| ------------------ | -------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`             | `key`                      | none                                  | `{ key: 'schema', version: 1, createdAt }`                                                                                                                                                    |
| `missions`         | `missionId`                | none                                  | `{ missionId, missionVersion, firstOpenedAt, lastCode: Record<path, string>, lastCodeHash, passedCode?: Record<path, string>, firstPassedAt? }`                                               |
| `attempts`         | `attemptId` (a UUID)       | `missionId`, `[missionId, startedAt]` | `{ attemptId, missionId, missionVersion, codeHash, startedAt, durationMs, outcome: 'pass' \| 'fail' \| 'error' \| 'timeout', objectives: Record<objectiveId, 'pass' \| 'fail'>, hintsShown }` |
| `objectiveResults` | `[missionId, objectiveId]` | `missionId`                           | `{ missionId, objectiveId, missionVersion, firstPassedAt?, attemptsBeforePass, failedChecks }`                                                                                                |
| `hintEvents`       | auto-increment             | `missionId`                           | `{ missionId, missionVersion, hintId, objectiveId?, shownAt }`                                                                                                                                |

`codeHash` is the SHA-256 of the files, joined in path order, from `crypto.subtle`.
`durationMs` counts the time since the previous attempt, or since the mission opened, while
the tab was visible. `hintsShown` is the count of hint events before the attempt.

rc.0 shows, per mission, a pass or fail marker per objective and three figures: attempts,
time spent and hints used. It shows no ranking and no score.

Stars and ship-upgrade badges are derived views. A later release computes three stars per
mission from `objectiveResults` and `hintEvents` (a hint or a failed check before the pass
lowers the count) and awards a cosmetic badge from the set of passed missions. The stores
hold raw events, so both features read version 1 data as it is.

Schema versions follow one rule: an upgrade adds a store or an index and never rewrites a
record. `onupgradeneeded` runs a list of additive steps keyed by version. The `meta` record
holds the version, and a test opens a version 1 database with a later schema and asserts
every record reads back unchanged.

### 12.7 Export, reset and private mode

`/academy/progress/` lists every mission's status and stats and offers two actions.

- Export downloads a JSON file, `nexusdi-academy-progress.json`, with
  `{ format: 'nexusdi-academy-export', version: 1, exportedAt, stores: { … } }` holding
  every record of every store, through a `Blob` and an object URL.
- Reset asks for confirmation, then deletes the database and reloads the page.

When `indexedDB.open` throws or fails, which happens in some private browsing modes, the
Academy shows a notice at the top of every mission: "This browser is not saving Academy
progress. Missions still run, and your code stays until you leave the page." The missions
keep their state in memory for the session.

### 12.8 Nothing leaves the browser

The Academy makes no network request apart from loading the site's own assets. It has no
analytics and no account, so no server ever holds a reader's progress. The export file is
the only way progress leaves the browser, and the reader starts it. An end-to-end test asserts that a full mission run
requests nothing outside the site's origin (section 16).

## 13. Docs tooling

### 13.1 `tools/doc-examples`

The package is copied from the libraries repo's `tools/doc-examples` at the `main` commit
current when Phase 1 starts, and the commit that adds it names that libraries commit. From
then on this repository owns it. The copy is the whole `src/` directory: `regions.mjs`,
`mdx-region-loader.mjs`, `mdx-reference-loader.mjs`, `declarations.mjs`, `preamble.mjs`,
`md-siblings.mjs`, `expect-comments.ts`, `vite-plugin.ts`, `vite-config.ts` and `index.ts`,
with their `.d.mts` files.

Four changes, and nothing else:

1. The package name becomes `@nexusdi/doc-examples`, private, under the same subpath
   exports.
2. `vite-config.ts` and `declarations.mjs` resolve through `@nexusdi/source` in place of
   `@evanion/source`.
3. `mdx-reference-loader.mjs` takes a `classPrefix` option and emits
   `${classPrefix}-api-entry`, `${classPrefix}-api-entry__signature`,
   `${classPrefix}-api-entry__more` and `${classPrefix}-kind-<kind>`. The docs app passes
   `classPrefix: 'nexus'`. The option has no default, so a caller that forgets it fails
   at load time.
4. The doc comments that name `@evanion/*` packages as examples are rewritten to name
   `@nexusdi/core`.

`libs/core` and `examples/meridian` wire `docExamples()` into their Vitest configs, so
their README and source regions run as tests and `// -> value` claims become assertions.

### 13.2 Loaders and build steps

`apps/docs/next.config.ts` registers the libraries chain under `turbopack.rules['*.mdx']`,
in the libraries order, which Turbopack runs in reverse:

1. `@nexusdi/doc-examples/mdx-reference-loader` with `{ root, classPrefix: 'nexus' }`
2. `@nexusdi/doc-examples/mdx-region-loader` with `{ root }`
3. `apps/docs/tools/mdx-diagram-loader.mjs`, copied, with the Meridian palette
4. `apps/docs/tools/mdx-listing-loader.mjs`, copied unchanged

The config also sets `output: 'export'`, `images: { unoptimized: true }`,
`trailingSlash: true`, `basePath: process.env.DOCS_BASE_PATH ?? ''` (section 14.4) and
Nextra's `search: { codeblocks: false }`.

The docs app's Nx targets run the generated inputs before `next build`, each cached on its
inputs:

| Target                  | Script                       | Writes                                                                           |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `docs:runtime-assets`   | `tools/runtime-assets.mjs`   | `public/runtime/core-<hash>/` from `libs/core/dist`, and `harness.js`, `boot.js` |
| `docs:playground-types` | `tools/playground-types.mjs` | `public/runtime/types-<hash>.json` and each seed's emitted JavaScript            |
| `docs:console-fixtures` | `tools/console-fixtures.mjs` | `components/console/fixtures/<seed>.json`                                        |
| `docs:academy-runtime`  | `tools/academy-runtime.mjs`  | `public/academy-runtime/<id>-<hash>.js`                                          |
| `docs:behaviour-data`   | `tools/behaviour-data.mjs`   | the per-export behaviour JSON the reference loader reads                         |

Every generated path is gitignored. `docs:build` depends on `^build` and on all five.

`postbuild` runs three steps over `out/`, in this order: `tools/md-siblings.mjs` writes the
`.md` sibling of every page after region and reference expansion, `tools/blog-feed.mjs`
writes `blog/atom.xml`, and Pagefind indexes the HTML into `out/_pagefind`. The docs
workflow runs `postbuild` as its own step, because Nx calls `next build` directly and npm's
lifecycle never fires (the libraries `docs.yml` records the same).

### 13.3 Guards

Each guard lives in `tools/repo-checks/src` and follows the libraries shape: read the
content tree, hold it against something derived, fail with a message naming the file and
the fix. Phase 1 adds the guards, before most pages exist. G2 and G4 each record the
roles and pages Phase 1 has not written in an allowance file, on the libraries ratchet
mechanism, and every entry leaves as its page arrives. By rc.0 every allowance is empty
except G8's, which lists the pages whose length the reviewer accepted.

| Guard                     | Source in the libraries repo | Rule here                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 `doc-navigation`       | `docs-navigation`, G1 half   | Every page under `content/` is a `_meta.ts` key and every key is a page. Every page declares a valid `kind`. `requires` names at most two pages, each earlier in `_meta.ts` order and of a teaching kind.                                                         |
| G2 `doc-floor`            | `doc-floor`                  | `index` (`overview`), `getting-started` (`tutorial`), at least one `concept` page and `api` (`reference`) exist.                                                                                                                                                  |
| G3 `doc-fence`            | `doc-fence`                  | Every fence is `file=… region=…`, `twoslash`, a shell language, `mermaid`, or carries one of the five tags. A `post` fence carries `no-run` or `elided`.                                                                                                          |
| G4 `doc-control`          | `doc-control`                | `getting-started` mounts a `ConsoleView`. Every H2 section of a `concept` page mounts exactly one. Every `ConsoleView` has a non-empty `caption`.                                                                                                                 |
| G5 `doc-exports`          | `doc-exports`                | Every `import … from '@nexusdi/…'` in a fence resolves through `libs/core`'s `exports` map under `@nexusdi/source`, and every bound name is exported there. Posts are skipped.                                                                                    |
| G6 `doc-specimen`         | `doc-specimen`               | `MeridianOnline` is mounted on a content page besides `index`.                                                                                                                                                                                                    |
| G7 `doc-links`            | `doc-links`                  | Every root-relative link names a content page or an app route. A link hard-coding `/next/` fails, because Next adds the base path.                                                                                                                                |
| G8 `doc-prose-budget`     | `doc-prose-budget`           | 1,200 words of prose a page, reported and not failed. Pages whose slug starts with `api` are exempt.                                                                                                                                                              |
| G9 `doc-domain`           | `doc-domain`                 | No fence, after region expansion, names a noun from section 6.4. Pages with `domainExempt` in frontmatter and `post` pages are skipped.                                                                                                                           |
| G10 `doc-export-coverage` | `doc-export-coverage`        | Every export of `.`, `./node` and `./testing` has a `##` heading on an `api*` page, and every callable one appears in an executable fence. Every `NexusErrorCode` member has an `###` on `api-errors`. Every codemod TODO and note code has an `##` on `codemod`. |
| G11 `doc-behaviour`       | `doc-behaviour`              | Every non-error callable export has a `describe` naming it in `libs/core`'s tests (open question 3).                                                                                                                                                              |
| `doc-refused-words`       | `doc-refused-words`          | The libraries list, plus the em dash and the en dash in prose.                                                                                                                                                                                                    |
| `doc-antithesis`          | `doc-antithesis`             | Unchanged.                                                                                                                                                                                                                                                        |
| `doc-figures`             | `doc-figures`                | The libraries list, plus `lands`, `bites`, `earns` and `pays` in prose, which have no literal use on this site.                                                                                                                                                   |
| `doc-notices`             | new                          | Notice labels are `Note`, `Exception`, `Warning` and `Ship note`. At most two a page, never adjacent.                                                                                                                                                             |
| `doc-twoslash`            | `doc-twoslash`               | Unchanged: every `twoslash` fence compiles, and every declared `@errors` code is still produced. Compiles with `compiler-options.ts`.                                                                                                                             |
| `doc-regions`             | `doc-regions`                | Unchanged: every cited file and region exists. Also covers seed and mission regions.                                                                                                                                                                              |
| `doc-md-siblings`         | `doc-md-siblings`            | Unchanged: every `.md` sibling carries each cited region's code. Covers posts.                                                                                                                                                                                    |
| `diagram-captions`        | `diagram-captions`           | Unchanged.                                                                                                                                                                                                                                                        |
| `doc-reference`           | `doc-reference`              | The reference loader against `@nexusdi/core`'s built declarations.                                                                                                                                                                                                |
| `docs-trigger`            | `docs-trigger`               | `docs.yml`'s path filter covers `libs/**`, `internal/**`, `examples/meridian/**` and `tools/doc-examples/**`.                                                                                                                                                     |
| `doc-seeds`               | new                          | Section 10.9.                                                                                                                                                                                                                                                     |
| `academy-missions`        | new                          | Section 13.4.                                                                                                                                                                                                                                                     |
| `docs-deploy`             | new                          | `apps/docs/deploy.json` matches its schema, and the `/v0.3/` retention check in section 14.7.                                                                                                                                                                     |

The rules no guard reaches stay the reviewer's (standard §12): the teaching order and its
fading, whether a teaching layer stands alone, whether an H2 section stands alone when cut
out, whether a diagram or a console caption is still true, whether a control teaches,
and whether an example is set on the Meridian.

### 13.4 The mission guard

`tools/repo-checks/src/academy-missions.test.ts` runs every mission in Node against
`libs/core/dist`, the build the browser runtime copies:

1. The solution type-checks with `compiler-options.ts` with no diagnostics. The seed
   produces exactly the diagnostics its mission lists in `seedDiagnostics`, in both
   directions, the way `doc-twoslash` treats `@errors`. Mission 1 lists the type error its
   first objective teaches the reader to fix.
2. The guard transpiles the seed with the worker's transformer, loads it as a fresh module
   graph, and runs every check. Every objective marked `teaches: true` fails, and every
   failure carries a non-empty message.
3. It does the same with the solution. Every objective passes.
4. Each check finishes inside the 5-second limit the browser applies.
5. For N > 1, every file mission N's seed carries forward equals the same file in mission
   N−1's solution, so the chain in section 12.4 holds.

The Playwright suite runs missions 1 and 6 in the real sandbox (section 16), which covers
the browser half of the same contract.

### 13.5 The reviewer agent

`.claude/agents/docs-reviewer.md` is the libraries agent with these changes:

- It reads `apps/docs` and `apps/docs/academy`, and checks claims against `libs/core/src`
  and core spec §§3 to 11.
- The domain rule names the Meridian and section 6, and the notice rule names `Ship note`.
- A region's source is in `examples/meridian` or `libs/core/README.md`, and the agent
  reads the region, since the fence is empty in the MDX.
- Three new checks: a `ConsoleView` caption states in words what its view shows; no
  sentence sends the reader to the console for a meaning the prose leaves out; a mission
  briefing names every export its checks read.
- It reads the libraries standard and public guidance from `Evanion/libraries` on `main`
  (open question 6) and this spec for the NexusDI amendments.

The agent reports findings and edits nothing, as the libraries agent does.

### 13.6 The skill

`.claude/skills/docs-page/SKILL.md` is the libraries skill with NexusDI's verification and
traps. It names the three specs by URL (open question 6) and this spec. Verification is
the CI command, `npx nx run-many -t lint test build typecheck`, then
`npx nx e2e docs-e2e` for a page that mounts the runtime, then `npx prettier --check .`.
The traps list keeps every libraries trap (a stale `.next`, the Nx cache shared across
worktrees, a stale `dist` behind twoslash and the reference loader, the shared stash, empty
region fences, `twoslash` as the only extra meta word, `^?` on the last line, the upstream
`.twoslash-query-presisted` spelling, one-directional `@errors`, the mermaid caption) and
adds three:

- A link written as `/next/…` breaks at the swap. Write root-relative links; Next adds the
  base path.
- Console fixtures and seed JavaScript are built from `libs/core/dist`. After an engine
  change, rebuild core before reading a console.
- `mission.ts` edits that change an objective raise `version`, or the progress store mixes
  attempts from two definitions.

### 13.7 Workspace wiring

Each new project starts from its official generator, and lint, format and type generation
are wired before its second file exists:

| Project                | Generator                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/docs`            | `npx create-next-app@16`, then Nextra 4 added per its installation guide, which publishes no generator |
| `apps/docs-e2e`        | `npx nx g @nx/playwright:configuration`                                                                |
| `internal/meridian-ui` | `npx nx g @nx/react:library internal/meridian-ui --bundler=vite`                                       |
| `examples/meridian`    | `npx nx g @nx/js:library examples/meridian --bundler=none --unitTestRunner=vitest`                     |

`tools/doc-examples` is a copy, so no generator applies to it.

The root `package.json` adds `apps/*` and `internal/*` to `workspaces`, and
`tsconfig.json` adds the new projects to `references`. `commitlint.config.js` adds the
scopes `docs`, `docs-e2e`, `meridian-ui`, `example-meridian` and `doc-examples`, which
`commitlint-scope-enum.test.ts` requires. `nx.json`'s `release.projects` stays `libs/*`, so
none of these projects is versioned or published.

`apps/docs/tsconfig.json` sets `customConditions: []`, so the app resolves
`@nexusdi/core` through its published `exports` to `dist`. The libraries baize-ui spec §7
records why: `next build` type-checks with a `tsc` that does not build project references,
and the source condition would point at declarations no target emitted (TS6305). The site
documents the published surface for the same reason.

## 14. Build and deploy

### 14.1 Modes

`apps/docs/deploy.json` is committed and holds the deploy's mode and the snapshot's
identity:

```json
{
  "mode": "rc",
  "snapshot": {
    "tag": "docs-snapshot-0.3",
    "source": "6d5e4f3",
    "assets": {
      "root": { "name": "nexusdi-docs-0.3-root.tar.gz", "sha256": "…" },
      "archive": { "name": "nexusdi-docs-0.3-archive.tar.gz", "sha256": "…" }
    }
  },
  "finalDate": null
}
```

| Mode            | Root of the artifact           | Under `/next/` | Under `/v0.3/`                    | When                                      |
| --------------- | ------------------------------ | -------------- | --------------------------------- | ----------------------------------------- |
| `snapshot-only` | the 0.3 snapshot, root variant | nothing        | nothing                           | Phase 1, until rc.0                       |
| `rc`            | the 0.3 snapshot, root variant | the new site   | nothing                           | from just before rc.0 to 0.4.0 final      |
| `final`         | the new site                   | redirect stubs | the 0.3 snapshot, archive variant | from 0.4.0 final until the retention ends |
| `retired`       | the new site                   | redirect stubs | redirect stubs                    | after the retention ends                  |

A mode change is a one-line pull request, so the swap is reviewed and recorded like any
other change. `snapshot-only` exists so Phase 1 proves the snapshot pipeline in production
and restores a working deploy once `chore/tooling-upgrade` removes `deploy-docs.yml`.

### 14.2 The 0.3 snapshot

`.github/workflows/docs-snapshot.yml` runs on `workflow_dispatch` only, with a `source`
input that defaults to `6d5e4f3`, and holds `contents: write` and `pull-requests: write`
for steps 6 and 7. Docusaurus exists only at that commit, so this workflow is the only
place the Docusaurus toolchain ever runs again. Its actions carry the same SHA pins as
`docs.yml`.

1. Check out `main` for `apps/docs/snapshot/`, then check out `source` into `snapshot-src/`.
2. Set up Node 22 through `actions/setup-node`, pinned. Docusaurus 3.8.1 predates Node 24,
   and the snapshot needs one runtime known to build it.
3. `npm ci` in `snapshot-src/docs`.
4. Build twice with `docusaurus build --config`, each time with an overlay config from
   `apps/docs/snapshot/` that imports the original `docusaurus.config.ts` and overrides
   a few fields:
   - The root variant keeps `baseUrl: '/'` and adds an `announcementBar`: "NexusDI 0.4 is
     in release candidate. Its documentation is at /next/." (open question 4).
   - The archive variant sets `baseUrl: '/v0.3/'`, `noIndex: true`, and an
     `announcementBar` that cannot be closed: "You are reading the documentation for
     NexusDI 0.3, which is deprecated. The current documentation is at nexus.js.org, and
     the upgrade guide is at nexus.js.org/upgrade/."
5. Remove `CNAME` from both builds, pack each as a `.tar.gz`, and write `SHA256SUMS`.
6. Create the GitHub Release `docs-snapshot-0.3` on the tag of the same name at `source`,
   marked not latest, with the two archives and the checksum file as assets.
7. Open a pull request that writes the checksums into `deploy.json`.

A release asset is permanent. A workflow artifact expires after at most 90 days, and the
snapshot has to last until the retention ends. The docs deploy downloads the assets with
`gh release download` and verifies each checksum before it unpacks anything.

### 14.3 The docs workflow

`.github/workflows/docs.yml` follows the libraries `docs.yml` and the CI conventions on
`chore/tooling-upgrade`:

- Triggers: `push` to `main` with a `paths` filter (`apps/docs/**`, `libs/**`,
  `internal/**`, `examples/meridian/**`, `tools/doc-examples/**`, `package.json`,
  `package-lock.json`, `.github/workflows/docs.yml`), and `workflow_dispatch`.
  `docs-trigger.test.ts` holds the filter against the release projects and the docs
  project's inputs.
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- Concurrency: group `pages`, `cancel-in-progress: false`.
- Every action pinned by commit SHA with the version in a comment, the pins the libraries
  workflow and `ci.yml` already use: `actions/checkout@3d3c42e5…` (v7.0.1),
  `actions/setup-node@82076278…` (v7.0.0), `actions/configure-pages@45bfe019…` (v6.0.0),
  `actions/upload-pages-artifact@fc324d35…` (v5.0.0), `actions/deploy-pages@368f8252…`
  (v5.0.1).
- Node from `.nvmrc`, `npm ci`, and `fetch-depth: 0` so the release notice can read tags.

The build job:

1. Reads `deploy.json`. In `rc` mode it sets `DOCS_BASE_PATH=/next`; in `final` and
   `retired` it sets it empty. `snapshot-only` skips steps 2 and 3.
2. `npx nx build docs`, which builds `libs/core` first and runs the five prebuild targets.
3. `npm run postbuild` in `apps/docs`: the `.md` siblings, the Atom feed, Pagefind.
4. Downloads and verifies the snapshot variant the mode needs.
5. Assembles `site/` per the mode table, writes `CNAME` (`nexus.js.org`) and `.nojekyll`
   at its root, and writes the redirect stubs (section 14.6).
6. Checks the artifact (section 14.5).
7. Uploads `site/` with `upload-pages-artifact`.

The deploy job runs `deploy-pages` in the `github-pages` environment, as today.

### 14.4 The base path

During the RC the new site builds with `basePath: '/next'`. Next applies the base path to
every link, every asset URL and every `next/link` navigation in the export, while the files
in `out/` stay unprefixed. The assembly step copies `out/` into `site/next/`.

Search keeps working under the base path. Nextra 4.6.1's search component imports
`addBasePath('/_pagefind/pagefind.js')` and navigates results through `next/link`, which
adds the base path again (`nextra/dist/client/components/search.js`). So Pagefind indexes
`out/` with no `--base-url`, its results carry root-relative URLs such as `/tokens/`, and
the link resolves to `/next/tokens/`. An end-to-end test runs a search under `/next/` and
follows a result (section 16).

Everything the runtime loads uses the base path: `runtime/`, `academy-runtime/` and the
import map URLs (section 10.4). The Atom feed and the canonical URLs are absolute and
include `/next` during the RC.

### 14.5 Artifact checks

The "Check deploy artefacts" step fails the deploy when any of these fails:

- `CNAME` exists once, at the root, and reads `nexus.js.org`. No `CNAME` exists below the
  root.
- `.nojekyll` and `index.html` exist at the root.
- In `rc` mode: `next/index.html`, `next/_pagefind/pagefind.js`, `next/getting-started.md`,
  `next/blog/atom.xml`, `next/runtime/types-*.json` and one `next/runtime/core-*/index.js`
  exist, and the snapshot contains no `next/` directory of its own.
- In `final` mode: `v0.3/index.html` exists, every HTML file under `v0.3/` carries
  `noindex`, and every `href` and `src` in it starts with `/v0.3/` or is external.
- The new site's file count and the snapshot's file count are both above zero, and the
  step prints both.

With a custom Actions workflow, GitHub Pages takes the custom domain from the repository
settings and ignores a `CNAME` file. The step keeps the file and checks it anyway, as the
libraries workflow does, so the artifact states its own domain and a move to branch
publishing keeps working.

### 14.6 The swap at final and the redirect stubs

At 0.4.0 final a pull request sets `mode: "final"` and `finalDate` to the release date.
Core spec §14 owns the 0.4.0 final checklist, and that pull request belongs on it.

The swap moves every URL, so the assembly step writes redirect stubs for the paths it
removes (open question 5):

- For each HTML path in the root snapshot that the new site does not serve (every
  `/docs/…` page and every old blog post URL), a stub at that path whose
  `<meta http-equiv="refresh">` and `<link rel="canonical">` point at the same path under
  `/v0.3/`.
- For each HTML path in the RC site, a stub under `/next/` pointing at the path with
  `/next` removed, so links shared during the RC keep working.

Each stub is a small static HTML page with a visible link, because GitHub Pages has no
redirect mechanism. In `retired` mode the `/v0.3/` stubs point at `/upgrade/`.

### 14.7 Retention of `/v0.3/`

The snapshot stays at `/v0.3/` for six months after `finalDate` or until `core@0.5.0` is
tagged, whichever is later (core spec §2.4 decision 9). `docs-deploy.test.ts` fails once
both conditions hold and `mode` is still `final`. The failure says to set `mode: "retired"`.
This is the libraries versioned-docs pattern (its decision 12): a repo-check schedules the
deferred step, so nobody has to remember the date.

The site keeps no other archive before 1.0. The libraries released-by-default spec retains
the current line plus one, on a caret segment (`v0.<minor>` below 1.0). NexusDI takes the
same segment grammar for `/v0.3/` and retains nothing when 0.5.0 supersedes 0.4, because
the owner set that bound for the pre-1.0 releases.

### 14.8 Search engines

During the RC every page under `/next/` carries `<meta name="robots" content="noindex,
follow">`, so search results keep pointing at the 0.3 documentation users run today. At
final the new site drops the tag, and the archive variant carries `noindex` through
Docusaurus's `noIndex`. With `follow`, crawlers still follow the links on an unindexed page
to the indexed ones, as the libraries released-by-default spec §10 describes.

### 14.9 The READMEs at rc.0

Core spec §14's rc.0 checklist item 2 adds an info box at the top of the repo root
`README.md` and of `libs/core/README.md`, which npm renders. The box points to the RC, its
documentation at `https://nexus.js.org/next/`, and the "0.4 RC feedback" Discussion. The
rc.0 release commit adds it and 0.4.0 final removes or rewords it. That checklist owns the
item. This spec requires only that `/next/` is deployed in `rc` mode before `nx release`
pushes the rc.0 commit, so the link resolves on the day npm shows it.

## 15. Accessibility and performance budgets

### 15.1 Accessibility

Every page and both tools meet WCAG 2.2 AA.

- Contrast. Section 7.2 sets the floors: 4.5:1 for every text role and 3:1 for control
  borders, in both themes, with the dark surface measured over the brightest pixel the
  background can produce. No text renders directly on the background canvas.
- Motion. `prefers-reduced-motion: reduce` stops the background, sets every transition to
  0ms, opens every trace replay paused, and renders `MeridianOnline` in its final state.
  The background animates for longer than five seconds, so the footer and the tool headers
  carry a "Pause background" switch that persists in `localStorage` (WCAG 2.2.2). The
  switch reads and writes inside `try`, and the page works when storage throws.
- Keyboard. Every control is reachable and operable by keyboard with a visible focus ring.
  `Escape` then `Tab` leaves the editor. The graph pans and zooms from the keyboard. The
  console follows scrolling and never moves focus.
- Screen readers. Each graph has a text alternative: its caption, and a `<details>` table of
  providers and edges. The trace replay announces each step through `aria-live="polite"`.
  Objective results are text with an icon beside it. A guided card moves focus to its
  heading when it changes. The reset confirmation is a native `<dialog>`.
- Structure. One `h1` a page, headings in order, landmarks from Nextra's layout, and the
  skip link Nextra provides. The tool routes render their own `main` landmark and skip
  link.

### 15.2 Performance budgets

| Budget                                                      | Limit                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| JavaScript on a content page, beyond Nextra's shared chunks | 10 kB gzipped                                             |
| The console island on a concept page                        | 35 kB gzipped                                             |
| The background module                                       | 8 kB gzipped; section 8.4 for CPU and GPU                 |
| The Playground before first interaction                     | 200 kB gzipped, CodeMirror included                       |
| TypeScript worker and declarations                          | 2.1 MB gzipped together, loaded on first interaction only |
| Largest contentful paint                                    | 2.5 s on Lighthouse's mobile profile                      |
| Cumulative layout shift                                     | 0.05                                                      |
| Interaction to next paint                                   | 200 ms                                                    |

`apps/docs/tools/check-budgets.mjs` runs after the build. It reads the script tags of each
exported HTML file, gzips every chunk the page references, and fails the build when a page
exceeds its row. The Playwright suite measures the three Web Vitals on the landing page, a
concept page and the Playground with CPU throttled four times through the Chrome DevTools
Protocol, and fails over budget.

## 16. Testing strategy

### 16.1 Unit tests

Vitest, per project:

- `internal/meridian-ui`: the generated CSS matches the generator byte for byte; every
  contrast floor in section 7.2 holds, the dark surface composited over white; components
  import only `createElement` and `Fragment`; component props accept formatted strings
  only, in a type test; the background scheduler, under a fake clock and a fake frame
  source, caps at 30, 15 and 10 frames a second in the right conditions, draws one frame
  and no loop under reduced motion and `saveData`, stops in a hidden tab, falls back to one
  canvas 2D frame without WebGL2, and releases everything on `stop()`.
- `apps/docs` runtime: the protocol guards accept every message shape and reject a wrong
  `v`, a wrong `runId` and a malformed payload; the serializer renders classes, functions,
  cycles and `NexusError`s; the transformer rewrites relative imports and inserts
  `__guard` into every loop and function body; `__guard` throws after 1,000 ms in one turn
  under a fake clock; the twoslash runner and the worker import the same compiler options.
- `apps/docs` views: the graph layout is deterministic, puts every provider on the layer
  core's level rule gives it for the Meridian fixtures, and routes every `lazy` edge
  outside the layers; the trace reducer steps forward and back, opens and closes scope
  lanes, orders disposal in reverse, and flags `untracked`.
- `apps/docs` Academy store: Vitest browser mode on Chromium, against real IndexedDB.
  Records round-trip in every store; a version 1 database opened by a later schema reads
  back unchanged; export produces the documented shape; reset deletes the database; a
  failing `indexedDB.open` switches to the in-memory store.
- `apps/docs` tools: the Atom feed has stable tag URIs, absolute URLs under the base path
  and newest-first order; the deploy assembly lays out each mode from fixtures, writes the
  stubs section 14.6 lists and fails each artifact check when its file is removed.
- `tools/doc-examples`: the libraries tests come with the copy, plus a test for the
  `classPrefix` option.

### 16.2 Guards

Every guard has fixture tests that fail on a sabotaged fixture and pass on a clean one, the
libraries pattern. `academy-missions` has a fixture mission whose seed passes an objective
it claims to teach, and one whose solution fails an objective. Both must fail the guard.

### 16.3 End-to-end tests

`apps/docs-e2e` runs Playwright against `out/` served under `/next/` by a static server
that mimics GitHub Pages (trailing slashes, no rewrites), in Chromium, Firefox and WebKit.

- Playground: `?seed=` loads the seed; no worker request goes out before the first
  interaction; an edit that breaks a type draws a squiggle; Run shows the console output,
  the graph and the trace; `while (true) {}` ends with the loop error within 2 seconds while
  a button on the page still responds; a microtask loop ends the same way; a run that never
  finishes ends at the wall clock; the iframe's `sandbox` attribute is exactly
  `allow-scripts`; code that reads `parent.document` gets an error; `fetch` to another
  origin is refused by the CSP; an unknown seed id shows an error.
- Console: on a 1440px viewport, scrolling a concept page switches the console view per
  section; on a 390px viewport, each view renders inline; with JavaScript disabled, every
  view's static SVG and caption are present.
- Academy: mission 1 runs through its guided cards to a pass; mission 6 fails on the seed
  with "FlightLog was built once for two shuttles." and passes on the solution; progress
  persists across a reload; the stats show attempts, time and hints; export downloads the
  documented JSON; reset clears progress; with `indexedDB.open` stubbed to throw, the notice
  appears and the missions still run; a full mission run makes no request outside the
  origin, asserted with request interception.
- Background: with reduced motion emulated, no animation frame runs after the first; with
  the page hidden, the loop stops; the module's main-thread time over 10 seconds stays
  inside section 8.4, from a Chrome DevTools Protocol trace.
- Contrast: in dark mode, every element with text has an ancestor surface whose computed
  background alpha is at least 0.86, so the arithmetic floor applies to every text node on
  the page.
- Search and feed: under `/next/`, a Pagefind search for `createScope` returns a result
  that opens `/next/scopes/`; `atom.xml` parses and each entry's link resolves.
- Accessibility: `@axe-core/playwright` reports no serious or critical violation on one page
  per kind, the Playground and both Academy layouts, in both themes.

After each deploy, a `smoke` job in `docs.yml` requests the root, `/next/` or `/v0.3/` as
the mode requires, and a known `.md` sibling, and fails on any status other than 200.

### 16.4 Visual checks

Playwright's `toHaveScreenshot` covers the landing page, Getting started, one concept page
at 1440px and 390px, the API page, the Playground, both Academy layouts and the blog post,
in both themes. `?background=frozen` renders the background's seeded first frame with no
loop, so screenshots are stable. `internal/meridian-ui/src/visual-check.html` renders every
token and component on one page and joins the same suite. A baseline changes only in a
pull request that says why.

## 17. Delivery phases

### 17.1 Phase 1: now, beside the engine

In this order:

1. Workspace wiring and the four scaffolds (section 13.7), and the `doc-examples` copy with
   its tests.
2. `meridian-ui`: tokens, generator, components, the background module and their tests.
3. The `apps/docs` shell: Nextra, the remap, fonts, the base path, the release notice, the
   `(tool)` group, the blog index and feed generator, `.md` siblings and Pagefind.
4. The guards, with Phase 1 allowances for the pages not yet written (section 13.3).
5. The deploy pipeline: `docs-snapshot.yml` run once, then `docs.yml` in `snapshot-only`
   mode, so nexus.js.org deploys from the new pipeline as soon as
   `chore/tooling-upgrade` merges.
6. The runtime: worker, sandbox, protocol, kill switch, editor, seed registry, console
   fixtures, and the graph and trace views. It builds against core spec §10's types with
   fixture JSON until the engine emits `graph()` and trace events, then against each
   engine build.
7. The Playground route and the Academy shell (store, layouts, the mission guard) with one
   fixture mission.

Phase 1 also settles five points by experiment before anything depends on them:

- A module fetch from an opaque-origin `srcdoc` frame to GitHub Pages succeeds in
  Chromium, Firefox and WebKit.
- An import map with `data:` URL targets and a hashed CSP resolves bare specifiers from a
  `data:` module in the same three engines.
- The MDX `wrapper` override renders the two-column concept layout inside Nextra 4.6.1's
  `Layout`.
- Search under `basePath: '/next'` returns links that resolve (section 14.4).
- `6d5e4f3` builds on Node 22 with both overlay configs.

A failed experiment reopens its section of this spec before implementation continues.

Phase 1 ends when nexus.js.org deploys from `docs.yml`, the guards pass on their fixtures,
and the Playground runs a seed against the current engine build.

### 17.2 Phase 2: after the 0.4 API passes review

Content waits for the review because every region runs against the API. The order: Start,
then Concepts in teaching order, then Migration (its fences cite the codemod fixtures), the
API reference (it needs core's docblocks), the RC blog post, the Guides and the missions.

Required for rc.0:

- Start and Concepts, complete.
- Migration, all four pages.
- The API reference, all four pages (open question 7).
- Guides: `/testing/`, `/node-request-scopes/` and `/legacy-decorators/`, plus the
  decorator page if open question 2 adds it. `container.set()` in tests is the most common
  0.3 pattern the RC breaks. `createChildContainer` was the 0.3 answer for per-request
  state on a server. Every 0.3 project enabled `experimentalDecorators`, and `/upgrade/`
  step 2 links to `/legacy-decorators/`.
- The Playground, because every concept page links to it.
- The RC announcement post (core spec §14, rc.0 checklist item 1).
- `deploy.json` in `rc` mode, deployed before the rc.0 release commit (section 14.9).

Within the RC window, before 0.4.0 final:

- `/react-router-ssr/` and `/load/`. Fewer 0.3 users reach for either, and the codemod's
  end-to-end test already migrates `examples/react-ssr`.
- The Academy, all nine missions. The Academy entry stays out of the navbar until missions
  1 to 4 pass the mission guard. Later missions join as each one passes it.

## 18. Out of scope

- A share-by-code link in the Playground. A link carries a seed id (section 10.9).
- Completions and hover types in the editor. The worker's language service could add them
  later.
- Clustering in the graph view beyond 60 nodes.
- The stars and badges interface. The schema supports both (section 12.6).
- Importing Academy progress, syncing it, or accounts.
- Missions for Errors, Introspection and trace, and testing.
- Per-tag blog pages, comments and a newsletter.
- Translations.
- Analytics of any kind.
- `llms.txt` (standard decision 14).
- A service worker or an offline mode.
- Any archive other than `/v0.3/` before 1.0.
- Documentation for interceptors (#17), the plugin registry (#19), the graph CLI (#18) and
  benchmarks (#21). Each feature's own spec adds its pages.
- Nested scopes, which 0.4 does not have (core spec §3.6).
- PixiJS, Sandpack, Monaco and Mermaid-rendered graph views.
- Replacing `nextra-theme-docs` with a custom shell (baize-ui spec §7, step 3).
- Migrating the 0.3 blog posts (decision 22).

## 19. Open questions

1. Concept pages have no kind in the standard's closed vocabulary. The standard allows
   extra teaching pages only as setup tiers, capped at three, and the approved IA has
   eleven concept pages. Recommendation: record a NexusDI amendment in this spec, a
   `concept` kind with the demonstration page's obligations (a full teaching layer, an
   executed region, a control per H2 section) and no cap, because each page adds a
   mechanism and none is a difficulty tier. The Concepts band then fills the standard's
   demonstration role, and G2 checks for at least one concept page. The body follows this
   recommendation.
2. The approved IA has no page for the decorator sugar (`@Injectable`, `@Inject` on an
   `accessor`, `@Module`, core spec §3.8). Readers from NestJS and Angular search for it.
   Recommendation: a question page in Guides, "How do I write providers with decorators?",
   at `/decorators/`, required for rc.0 beside `/legacy-decorators/`, which it links to.
3. G11 needs `libs/core`'s tests to put each non-error callable export under a `describe`
   spelling its name (`2026-09-22-docs-tests-per-export.md` decision 7). Core spec §17 does
   not state that convention. Recommendation: adopt it while the engine's tests are being
   written, and add one line to core spec §17, so the API reference renders a behaviour
   list for every export from rc.0.
4. The 0.3 site at the root has no way to tell a reader that 0.4 is in RC. Recommendation:
   the root variant of the snapshot carries a Docusaurus announcement bar linking to
   `/next/` (section 14.2). It changes no 0.3 page's content.
5. The swap moves every 0.3 URL under `/v0.3/` and every RC URL out of `/next/`, which
   breaks inbound links. Recommendation: the redirect stubs in section 14.6, generated from
   the snapshot's and the RC site's file lists, and pointed at `/upgrade/` once `/v0.3/` is
   retired.
6. The ported agent and skill read the libraries specs. A reader of this repository on
   another machine, or an agent in CI, has no `/Volumes/projects/Personal/open-source`.
   Recommendation: if `Evanion/libraries` is public, the agent and skill fetch the specs
   from `https://github.com/Evanion/libraries/blob/main/docs/specs/`; if it is private,
   vendor the specs this site follows into `specs/vendor/libraries/` at a pinned commit.
7. The owner named Start, Concepts and Migration as the rc.0 requirement. G2 and G10 fail
   without the API reference, and RC testers need exact signatures. Recommendation: the four
   API pages join the rc.0 requirement. The reference loader generates most of each entry
   from core's declarations and docblocks.
8. After final the root builds from `main`, so a change merged after a release appears on
   the site before npm has it. Recommendation: the release notice from section 4.1 stays
   after final and, when `libs/core` has commits since the newest `core@*` tag, states that
   the page may describe changes not yet released. This follows the libraries versioned-docs
   decisions 2 and 3, and adds no archive.
