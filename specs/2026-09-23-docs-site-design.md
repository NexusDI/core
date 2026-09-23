# The NexusDI documentation site

Status: approved design; implementation pending. Revised after an independent review of
`8f36641` and the owner's decisions on it. The owner approved every decision in section 2.
The owner then resolved every open question, and section 2 records each answer as a
decision. Section 20 holds nothing open.
Packages: `apps/docs` (new, `@nexusdi/docs`, private), `apps/docs-e2e` (new, Playwright),
`internal/meridian-ui` (new, private), `examples/meridian` (new, private),
`tools/doc-examples` (copied from the libraries repo), `tools/repo-checks` (extended). No
published package changes.
Depends on:

- `specs/2026-09-23-core-0.4-design.md` at `b5ab435`, the API this site teaches: §3 the
  public API and the Meridian names, §8.2 disposal and the `dispose:instance` event, §9 the
  error catalogue, §10 `graph()` and trace events, §11 the testing API, §13 the migration
  guide outline, the codemod and its `TODO_CODES` and `NOTE_CODES`, §14 the release plan
  and its rc.0 checklist.
- The core spec revision that adds two ways to declare a provider, which `b5ab435` does not
  yet specify: `static deps = [TOKEN] as const` on a plain class, and object-literal
  providers `{ token, useValue | useClass | useFactory | useExisting, deps?, lifetime? }`.
  Section 7.5 teaches both. Until that revision is merged, the regions that show them wait, and
  every other example uses `provide()`.
- `specs/2026-09-23-benchmarks-and-launch-design.md` on `spec/benchmarks-launch` at
  `85af1c1`: §4.7 the metrics, §4.9 the results schema, §4.11 how the docs read the results,
  §9 the guards, §12 its amendments to this spec. Every size and time figure on the site
  comes from its results files (section 4.6).
- `chore/tooling-upgrade`: Nx 23, TypeScript 6.0.3, Vitest 4, nodenext ESM, the
  `@nexusdi/source` condition, `tools/repo-checks`, SHA-pinned CI actions. It deletes
  `docs/` and `.github/workflows/deploy-docs.yml` from the tree.
- `@evanion/widget` 0.1.0 and `@evanion/react-widget` 0.3.0 from npm, pinned exactly
  (section 10.4).
- The libraries repo, `Evanion/libraries` on GitHub, which is public. This spec was
  measured against commit `f3f266d` of its `main`, and every port and reference below
  names a pinned commit (section 14.5). The documents it follows:
  `docs/specs/2026-09-16-documentation-standard.md` (the standard),
  `2026-09-20-public-documentation-guidance.md` (the sentence rules),
  `2026-09-13-interactive-examples.md`, `2026-09-16-diagrams.md`,
  `2026-09-13-versioned-docs.md` and `2026-09-13-released-by-default.md` (versioning),
  `2026-09-21-docs-api-reference.md`, `2026-09-22-docs-tests-per-export.md`,
  `2026-09-21-reference-page-budget.md` and `2026-09-12-baize-ui.md`. The code it copies
  or mirrors: `apps/docs`, `internal/baize-ui`, `tools/doc-examples`, the `doc-*` and
  `docs-*` guards in `tools/repo-checks/src`, `.claude/agents/docs-reviewer.md`,
  `.claude/skills/docs-page/SKILL.md` and `.github/workflows/docs.yml`.

Supersedes: `.github/workflows/deploy-docs.yml` on `main`, and the guide location in core
spec §13.1. The migration guide moves from `docs/docs/migration/0.3-to-0.4.md` to
`apps/docs/content/upgrade.mdx`. Core spec §15 hands the site structure to this document.
Measured against: `main` at `6d5e4f3` for the live 0.3 site, `chore/tooling-upgrade` for
the repository layout, and the libraries repo at `f3f266d` for the stack it runs: Next
16.3.4, Nextra 4.6.1, React 19.3.0, Pagefind ^1.5.2, twoslash 0.3.9, Tailwind 4.3.
The reviewer ran the sandbox probe, the declaration bundle, the TypeScript environment and
the snapshot build, and the figures from those runs are marked "measured by the review".
Prior art: the libraries docs app, which this site copies system for system; its landing
page, which renders `<Widgets>` as a server component (`app/(site)/page.tsx`) and holds
items in client state in `components/landing/DataDemo.tsx`; react.dev's Learn pages, which
set a sandbox beside the prose; Svelte's tutorial, where the site supplies the runtime and
each lesson is a change to the previous lesson's code; the TypeScript playground, which
runs `@typescript/vfs` in a worker; Docusaurus versioning, which serves the newest release
at the bare path.

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

1. Every page is re-evaluated and rewritten. The site keeps no 0.3 documentation page.
   Every 0.3 page teaches a removed API and none of its 302 fences executes, so no page
   meets the standard's fence rule (standard decision 11). The blog is the exception,
   by decision 22.
2. The site follows the libraries repo's documentation system: the standard, the public
   guidance, the loader chain and the guards, as of a pinned commit. It has its own visual
   identity. The owner's writing rules apply to every page. The libraries system comes with
   a test for each rule it can test, and the port brings those tests along.
3. Migration is a first-class band with six pages (section 4.3). 0.3.1 has users, and the
   RC exists so those users can migrate and report problems before final.
4. The stack is Next 16 and Nextra 4 with `output: 'export'`, Pagefind, twoslash, a `.md`
   sibling per page, and the libraries loader chain: the region loader, the reference
   loader, the listing loader and the diagram loader. The app lives at `apps/docs`. GitHub
   Pages serves static files, and every loader in the chain is a Turbopack loader written
   for this stack.
5. `internal/meridian-ui` holds the design tokens (TypeScript source that generates CSS),
   the stateless components (the panel, the Ship note callout, the console frame) and the
   background module. It mirrors the `baize-ui` split: components read CSS custom
   properties, and `apps/docs/app/global.css` remaps Nextra's variables onto the Meridian
   tokens. The split keeps every React component in the package stateless and lets the
   token test hold the CSS to the TypeScript values.
6. `tools/doc-examples` is copied from the libraries repo at a pinned commit and owned
   here. The copy swaps the `@evanion/source` condition for `@nexusdi/source` and takes the
   reference loader's class prefix as an option. A shared package would tie two
   repositories' release cycles to one tool.
7. `tools/repo-checks` gains the libraries docs guards, adapted to one package, and a guard
   that runs every Academy mission's seed, reference solution and decoys against its
   hidden checks (section 14.4).
8. The `docs-reviewer` agent and the `docs-page` skill are ported to `.claude/`, adapted to
   NexusDI (sections 14.6 and 14.7). They carry the rules no guard reaches.
9. The visual identity is direction D, "Deep space HUD": a deep navy nebula gradient from
   `#070a1c` to `#1a2150`, cyan `#5eeaff` and magenta `#ff5ec8` accents, glassy panels,
   thin geometric markers and Space Grotesk display type. "Ship note" is the domain
   notice label. The notice set is Note, Exception, Warning and Ship note, at most two a
   page (section 8).
10. The background is an animated nebula drift with slowly moving stars, written by hand
    as a WebGL2 module with a canvas 2D fallback. PixiJS is out. The module loads after
    the content, stops under `prefers-reduced-motion` and in hidden tabs, caps its frame
    rate on battery and when idle, and sits behind a reading surface that holds AA
    contrast (section 9).
11. The Starship Meridian is the one example domain across the site, with the vocabulary
    and mapping in section 7. Domain colour appears only in Ship notes, examples and page
    furniture. A sentence that states a rule uses NexusDI's own terms. No humour and no
    idioms (public guidance decision 16).
12. The navigation order is Start, Concepts, Guides, Migration, API, Academy and
    Playground. The blog sits outside the teaching path (section 4).
13. A concept page uses layout B, the sticky ship console: a narrow prose column and a
    console panel on the right that follows the section in view. On narrow screens the
    console collapses into inline specimens. The prose and fences teach the concept
    completely without the console (standard §5, the two-layer rule; section 10).
14. The console, the Playground and the Academy share one runtime: TypeScript 6.0.3 with
    `@typescript/vfs` in a Web Worker, emitted JavaScript running in an
    `<iframe sandbox="allow-scripts">` without `allow-same-origin`, an import map pointing
    at the workspace-built `@nexusdi/core`, a typed `postMessage` protocol and a
    CodeMirror 6 editor. Every seed comes from a doctested region (section 11).
    TypeScript 7 has no browser build, so the playground pins 6.x.
15. The graph and trace views render `graph()` JSON and trace events in custom SVG with a
    layered layout. Mermaid stays for static prose diagrams under the diagrams spec
    (section 12). The graph view redraws on every run, and Mermaid draws a static picture
    from about 500 kB of JavaScript.
16. The Academy at `/academy/` is nine missions that build the Meridian, one concept each,
    with the ship's code carried forward. Missions 1 to 3 use guided cards (option C);
    later missions use the briefing strip (option B). Every mission stays unlocked
    (section 13).
17. Academy progress lives in IndexedDB behind a small internal wrapper with no
    dependency. The stores hold raw events, and every figure the Academy shows is derived
    from them, so stars and ship-upgrade badges need no data migration later. Nothing
    leaves the browser (section 13.6).
18. During the RC the Pages deploy combines a build of the 0.3 Docusaurus site at the root
    with the new site under `/next/`. CI builds the 0.3 snapshot from `6d5e4f3` plus a
    small overlay and stores it as a release asset. At 0.4.0 final the deploy swaps: the
    root builds from the newest `@nexusdi/core@*` release tag, `/next/` keeps building
    from `main` (released-by-default decision 1), and the snapshot moves to `/v0.3/` with
    a deprecation banner for six months or until 0.5.0, whichever is later. No other
    archive exists before 1.0 (section 15).
19. Delivery runs in two phases. Phase 1 runs beside the engine work: the app shell,
    `meridian-ui`, the background, `doc-examples`, the guards, the deploy pipeline and the
    playground runtime. Phase 2 starts once the 0.4 API passes review: the content, the
    API reference and the missions (section 18).
20. The landing page is the site's overview page and demonstrates the product with a live
    specimen: the Meridian graph coming online as the container initialises
    (section 5.2).
21. During the RC the blog lives only on the 0.3 site at the root. The RC announcement
    (core spec §14, rc.0 checklist item 1) and later RC updates are published there
    through the snapshot overlay, and an announcement bar on every 0.3 page links to the
    post and to `/next/upgrade/`. `/next/` has no blog (section 6).
22. At 0.4.0 final the blog moves to the new site. Every old post migrates, the RC posts
    included, and every old post URL and the old feed URLs keep resolving. A migrated post
    keeps its text and gains a header naming the version it describes, with a link to the
    upgrade guide. Posts dated before 0.4.0 are exempt from the fence, domain and
    refused-word guards; posts from 0.4.0 on follow every rule (section 6).
23. The docs app composes its layouts from `@evanion/widget` 0.1.0 and
    `@evanion/react-widget` 0.3.0: the ship console's panels, the Academy's guided and
    briefing modes, the progress dashboard and data-driven views such as the next-mission
    recommendation. The pins are exact and a person bumps them in a pull request. Scroll
    and in-view tracking stay docs code (section 10.4).
24. Panel and mode changes animate with native View Transitions through React 19.3.0's
    `<ViewTransition>`. Under `prefers-reduced-motion`, and in a browser without the API,
    the change is an instant swap. `@evanion/react-widget` needs no change for it
    (section 10.5).
25. The standard gains two NexusDI amendments, both accepted: a `concept` page kind and a
    `post` page kind with the `blog/` folder (section 3).
26. The site answers the evaluator and the migrator directly: a comparison page, a runtime
    matrix, a bundler page and a custom-scope-context page for evaluators; a list of
    silent behaviour changes, the CHANGELOG link and a 0.3 support policy for migrators
    (section 4.3).
27. The 0.3 support policy: `latest` stays on 0.3.x until 0.4.0 final. A `0.3.x` branch
    receives security, crash and data-loss fixes only, and no features, until the `/v0.3/`
    retention ends: six months after 0.4.0 final or the release of 0.5.0, whichever is
    later. After that, 0.3.x receives nothing. The Migration band's `/support-policy/`
    page states the policy with its dates, and the RC announcement outlines it
    (sections 4.3 and 6.1).
28. The examples validate module options with valibot 1.5.0, vendored into the sandbox
    runtime and its import map, so the examples read like real-world code. Core stays
    dependency-free. A Guides page shows that zod and ArkType plug in the same way through
    Standard Schema (sections 7.2 and 11.4).
29. After 0.4.0 final, a documentation fix can reach the root before the next release
    through a re-cut: `deploy.json`'s `root.sha` names a commit that descends from the
    release tag, with a non-empty reason (section 15.6).
30. Every example is interface-first: in the docs, the blog from 0.4.0 on, the Playground
    seeds and the Academy missions. Each service has an interface and a typed token, each
    concrete class is bound in exactly one provider, consumers declare their deps as
    tokens against interface-typed constructor parameters, and no concrete class depends
    directly on another. Overrides are the recurring payoff: a module swap, a test override
    and a configurable module that picks an implementation (section 7.3).

## 3. Amendments to the libraries standard

The standard was written for small packages on a multi-package site. NexusDI is one
package with more teaching material, and two of its needs fall outside the standard's
closed vocabulary. Each amendment is recorded here, so the reviewer reads it beside the
standard.

### 3.1 A1, the `concept` kind (accepted)

The standard allows a teaching page past the floor only as a setup tier, capped at three,
and only where prior knowledge does not transfer (decision 4). NexusDI has eleven concept
pages.

Decision 4's test, applied: a reader from NestJS or Angular already knows tokens,
providers and modules, and knowledge transfers there. It stops transferring at the
mechanics 0.4 changes: a graph compiled and validated before any constructor runs, a
synchronous `get()`, deps tuples checked by the compiler with no metadata, encapsulation
enforced at startup, `lazy()` where NestJS uses `forwardRef`, scopes bound through
`AsyncLocalStorage`, and disposal through `Symbol.asyncDispose`. A reader who used 0.3 and
never used another container has no prior knowledge at all. So the concept pages stay, and
a page whose subject transfers (tokens) stays short.

A `concept` page carries the demonstration page's obligations: a full teaching layer, an
executed region, and a control in every H2 section. It introduces one mechanism, and none
of the eleven is a difficulty tier, so the three-tier cap does not apply. The Concepts band
fills the standard's demonstration role as a whole. G2 holds the named list of eleven
concept pages, and G4 accepts an H2 section with no console only when it carries
`<ConsoleExempt reason="…" />`, which shows the reason in the console panel.

### 3.2 A2, the `post` kind and the `blog/` folder (accepted)

A blog post is dated prose that nobody updates after publication, which is none of the
standard's page kinds. The amendment:

- `content/blog/` is a folder, the one exception to decision 18. The blog sits outside the
  sidebar and its order is by date, so the folder hides no teaching order.
- A `post` page has no prerequisites box, no control and no place in any teaching order.
- G3 exempts `post` pages, and a post's code carries the `elided` tag, because a dated post
  is not maintained against the current API.
- Posts dated before 0.4.0 are also exempt from the domain and refused-word guards.

## 4. Information architecture and page inventory

### 4.1 Navigation

The sidebar holds the documentation in five bands, each a separator in
`content/_meta.ts`: Start, Concepts, Guides, Migration and API. Start and Concepts form
the teaching path a reader walks from top to bottom. A reader enters Guides, Migration
and API with a goal already formed, which is the standard's arrival test (§2).

The navbar holds four entries in this order: Docs (to `/getting-started/`), Academy,
Playground and, from 0.4.0 final, Blog. Search, the theme switch and the GitHub link
follow them. Academy and Playground are full-screen tools in an `app/(tool)` route group,
the pattern the libraries repo uses for `/matrix-explorer/`, so neither renders the docs
chrome. Blog is a Nextra `type: 'page'` entry, so it appears in the navbar and stays out
of the sidebar.

URLs are flat. Standard decision 18 puts a separator at every level and a folder at none,
so `content/tokens.mdx` is served at `/tokens/`, and the Concepts band exists only in
`_meta.ts`. `content/blog/` is the one folder (amendment A2).

The content routes render through `app/(site)/[[...mdxPath]]/page.tsx`, an optional
catch-all, so `/` is `content/index.mdx` like every other page.

During the RC every path in this section except the blog sits under `/next/` (section 15).

### 4.2 Page kinds

Every page declares its kind in frontmatter (`kind: concept`). The guards read the field
(section 14.3), and the reviewer agent reads it to pick the rules that apply.

| Kind        | Standard page type      | Executed regions      | Control    | Sequence |
| ----------- | ----------------------- | --------------------- | ---------- | -------- |
| `overview`  | overview (`index`)      | at least 1            | no         | entry    |
| `tutorial`  | getting started         | every step            | required   | teaching |
| `concept`   | amendment A1            | at least 1            | one per H2 | teaching |
| `question`  | question page           | at least 1            | optional   | lookup   |
| `platform`  | platform guide          | at least 1            | no         | lookup   |
| `contract`  | format or contract page | at least 1, or a link | no         | lookup   |
| `reference` | API reference (`api`)   | 1 per callable export | no         | lookup   |
| `post`      | amendment A2            | none; code `elided`   | no         | none     |

Tool routes (`/playground/`, `/academy/` and its children) are not content pages. The
libraries repo treats `/matrix-explorer/` the same way.

### 4.3 Inventory

"Requires" is the prerequisites box (standard §2), which names the one or two pages
immediately before. Lookup pages carry no box and link to the page that teaches a concept.
"Control" names what the console shows (section 10) or the specimen the page mounts.

| #   | Path                     | Title                                                                | Kind        | Introduces                                                                                                                                                         | Requires                         | Control                                              |
| --- | ------------------------ | -------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------- |
| 1   | `/`                      | NexusDI                                                              | `overview`  | what NexusDI is, when to use it and when to skip it, bundle size and dependency count                                                                              | none                             | `MeridianOnline` specimen                            |
| 2   | `/getting-started/`      | Getting started                                                      | `tutorial`  | install, the TypeScript settings, one interface and its token, `provide(TOKEN, { useClass, deps })`, one module, `Nexus.create`, `get`, `await using`              | none                             | console: graph of the first ship                     |
| 3   | `/tokens/`               | Tokens and interfaces                                                | `concept`   | a typed `Token<T>` per interface, identity comparison, `useValue`, why the docs bind interfaces                                                                    | Getting started                  | console: graph                                       |
| 4   | `/providers/`            | Providers                                                            | `concept`   | `useClass` with `deps`, `useFactory` sync and async, `useExisting`, `optional()`, object-literal providers, `static deps`, defaults and rest parameters            | Tokens and interfaces            | console: graph and a `NAV_CHARTS` specimen           |
| 5   | `/lifetimes/`            | Lifetimes                                                            | `concept`   | `singleton` and `transient`                                                                                                                                        | Providers, Tokens and interfaces | console: trace replay of two drones                  |
| 6   | `/modules/`              | Modules                                                              | `concept`   | `defineModule`, `imports`, `exports`, encapsulation, `global: true`, `has()`, `get(T, { module })`, a module swap                                                  | Lifetimes, Providers             | console: graph with module visibility, then the swap |
| 7   | `/configurable-modules/` | Configurable modules                                                 | `concept`   | `options`, `with(value)`, `with({ deps, useFactory })`, `schema`, an option that picks the implementation                                                          | Modules, Lifetimes               | console: the chosen link and a frequency check       |
| 8   | `/scopes/`               | Scopes and REQUEST                                                   | `concept`   | `createScope`, `scoped`, `REQUEST`, the captive rule                                                                                                               | Configurable modules, Modules    | console: trace replay of two shuttles                |
| 9   | `/lifecycle/`            | Lifecycle and disposal                                               | `concept`   | `onInit`, `Symbol.asyncDispose`, disposal order, `SuppressedError`                                                                                                 | Scopes and REQUEST               | console: replay of startup and scram                 |
| 10  | `/lazy/`                 | Lazy edges and cycles                                                | `concept`   | `lazy()`, `NEXUS_CIRCULAR_DEPENDENCY`, `NEXUS_NOT_READY`                                                                                                           | Lifecycle and disposal           | console: the cycle ring, then the lazy fix           |
| 11  | `/multi-providers/`      | Multi-providers                                                      | `concept`   | `MultiToken`, `all()`, multi-token visibility                                                                                                                      | Lazy edges and cycles            | console: graph of the `DIAGNOSTICS` fan-in           |
| 12  | `/errors/`               | Errors                                                               | `concept`   | `NexusError`, codes, one `BlueprintError` for every compile error, `ProviderError.cause`                                                                           | Multi-providers                  | console: the error view of a broken Meridian         |
| 13  | `/introspection/`        | Introspection and trace                                              | `concept`   | `graph()`, the `trace` callback                                                                                                                                    | Errors                           | `MeridianOnline` and a full trace replay             |
| 14  | `/node-request-scopes/`  | Scope an HTTP request in Node                                        | `platform`  | `nodeScopeContext`, `runInScope`, `currentScope`                                                                                                                   | none; links to Scopes            | none: the unit is a running server                   |
| 15  | `/react-router-ssr/`     | React Router server rendering                                        | `platform`  | the `examples/react-ssr` wiring                                                                                                                                    | none; links to Scopes            | none: the unit is a running server                   |
| 16  | `/testing/`              | How do I replace a provider in a test?                               | `question`  | `createTestingContainer`, `override(TOKEN, { useClass })`, `overrideModule`                                                                                        | none                             | console: a test run with `FakeReactor`               |
| 17  | `/load/`                 | How do I add a module after startup?                                 | `question`  | `load()`                                                                                                                                                           | none                             | console: trace replay of a load                      |
| 18  | `/decorators/`           | How do I write providers with decorators?                            | `question`  | `@Injectable`, `@Inject` on an `accessor`, `@Module`                                                                                                               | none                             | console: graph                                       |
| 19  | `/legacy-decorators/`    | How do I use NexusDI in a project that keeps experimentalDecorators? | `question`  | `NEXUS_LEGACY_DECORATORS` and the `provide()` path                                                                                                                 | none                             | none                                                 |
| 20  | `/scope-context/`        | How do I scope requests outside Node?                                | `question`  | a custom `ScopeContext` for Deno, Bun, Workers and the browser                                                                                                     | none                             | console: a scope context run                         |
| 21  | `/bundlers/`             | How do I use NexusDI in a browser bundle?                            | `question`  | bundler settings, `keepNames`, the polyfills in `sideEffects`, decorator transforms                                                                                | none                             | none                                                 |
| 22  | `/schemas/`              | Which schema libraries can validate module options?                  | `question`  | valibot in the examples; zod and ArkType through Standard Schema                                                                                                   | none                             | console: a failed validation                         |
| 23  | `/runtimes/`             | Where NexusDI runs                                                   | `contract`  | the runtime matrix with the evidence for each row                                                                                                                  | none                             | none                                                 |
| 24  | `/comparison/`           | NexusDI compared with tsyringe, InversifyJS, TypeDI and NestJS       | `contract`  | the differences; why NexusDI needs no compiler flags and no `reflect-metadata`; bundle size, startup, resolve time and build time, each from the benchmark harness | none                             | none                                                 |
| 25  | `/upgrade/`              | How do I upgrade from 0.3 to 0.4?                                    | `question`  | core spec §13.1 steps 1 to 9, the CHANGELOG link, the support-policy link                                                                                          | none                             | none                                                 |
| 26  | `/upgrade-api-map/`      | 0.3 to 0.4 API map                                                   | `contract`  | one H2 per 0.3 API, from core spec §13.1's table                                                                                                                   | none                             | none                                                 |
| 27  | `/upgrade-behaviour/`    | Behaviour that changes without a compile error                       | `contract`  | the silent behaviour changes, one H2 each                                                                                                                          | none                             | none                                                 |
| 28  | `/codemod/`              | How do I run the 0.4 codemod?                                        | `question`  | the CLI, the report, one H2 per TODO and note code                                                                                                                 | none                             | none                                                 |
| 29  | `/encapsulation/`        | Why does a provider stop resolving after upgrading to 0.4?           | `question`  | module encapsulation, seen from 0.3 code                                                                                                                           | none                             | console: `NEXUS_NOT_VISIBLE`, then the fix           |
| 30  | `/support-policy/`       | 0.3 support policy                                                   | `contract`  | the 0.3.x support policy and its dates                                                                                                                             | none                             | none                                                 |
| 31  | `/api/`                  | `@nexusdi/core`                                                      | `reference` | one H2 per export of `.`, error classes excepted                                                                                                                   | none                             | none                                                 |
| 32  | `/api-testing/`          | `@nexusdi/core/testing`                                              | `reference` | one H2 per export of `./testing`                                                                                                                                   | none                             | none                                                 |
| 33  | `/api-node/`             | `@nexusdi/core/node`                                                 | `reference` | one H2 per export of `./node`                                                                                                                                      | none                             | none                                                 |
| 34  | `/api-errors/`           | Error reference                                                      | `reference` | one H2 per error class, one H3 per code                                                                                                                            | none                             | none                                                 |

Pages 14 to 24 are the Guides band, 25 to 30 the Migration band and 31 to 34 the API band.

The blog, on the new site from 0.4.0 final:

| #   | Path                                       | What it is                                                           |
| --- | ------------------------------------------ | -------------------------------------------------------------------- |
| B1  | `/blog/`                                   | The post index                                                       |
| B2  | `/blog/first-release/`                     | "Tabula Rasa", migrated, 0.1.0                                       |
| B3  | `/blog/native-decorators-simpler-modules/` | "The jump to lightspeed", migrated, 0.2                              |
| B4  | `/blog/0-4-release-candidate/`             | The RC announcement, migrated from the snapshot, plus any RC updates |

Tool routes:

| #   | Path                  | What it is                                                        |
| --- | --------------------- | ----------------------------------------------------------------- |
| T1  | `/playground/`        | The full-screen Playground, seeded by `?seed=<id>` (section 11)   |
| T2  | `/academy/`           | The mission list and the next-mission recommendation (section 13) |
| T3  | `/academy/[mission]/` | One route per mission, nine in all (section 13.1)                 |
| T4  | `/academy/progress/`  | Progress, stats, storage state, export and reset (section 13.7)   |

Counts: 34 documentation pages (2 Start, 11 Concepts, 11 Guides, 6 Migration, 4 API), 12
tool routes (the Playground, the Academy index, 9 missions and the progress page), and at
final a blog of an index and at least three posts.

Four notes on the inventory.

The Migration band splits core spec §13.1. `/upgrade/` walks the steps, links to
`libs/core/CHANGELOG.md` and links to `/support-policy/`, which states decision 27's policy
with its dates: the 0.4.0 release date, the end of the six months, and whether 0.5.0 has
been released.
`/upgrade-api-map/` holds the mapping table as one H2 per 0.3 API, so a reader who searches
a 0.3 name reaches an anchor. It has about 45 entries and runs past the 1,200-word budget.
G8 reports and does not fail (standard §4), and the page is recorded in
`doc-prose-budget.json`. `/upgrade-behaviour/` is the single list of changes that compile
and behave differently: a class-typed parameter 0.3.1 left `undefined` is now injected
(the codemod note `undecorated-param-injected`), every singleton is built at `create`,
`onInit` runs inside `create`, `has()` answers for visibility and returns `false` for a
private token or a module class, two `with()` calls build two module instances, one token
provided in two modules builds two singletons, a factory's result is disposed with the
container, and error messages start with their code (the TODO `error-message-match`).

`/api-errors/` carries one H3 per `NexusErrorCode` member, so every code has a stable
anchor, for example `/api-errors/#nexus_missing_provider`. Core spec §9 promises that the
docs link each code to a page that explains it, and these anchors are those links.
`NEXUS_PROMISE_TOKEN` has no runtime class, so it sits under an H2 for the type-level
messages of `provide()`.

The evaluator pages state facts with their evidence. `/runtimes/` gives each runtime
(Node 22 and 24, a CommonJS project on Node through `require()`, Chromium, Firefox, Safari
with the `Symbol.dispose` polyfill and the internal `SuppressedError` fallback, Deno, Bun,
Cloudflare Workers) a row naming the CI job that tests it, or "not tested" when none does.
The page opens with the ESM-only note of section 5.3.1. `/comparison/` cites the documentation
URL and version for every claim about another library, as read on the date the page
states. Section 4.6 sets where every size and time figure comes from.

`/comparison/` presents the measured benefits as its concrete case: bundle size, startup
time, resolve time and build time. Its H2 "Why NexusDI needs no compiler flags" is the
site's answer to that question, and it cites the same measurements, since dropping
`experimentalDecorators`, `emitDecoratorMetadata` and `reflect-metadata` is what the build
time and bundle figures measure. The benchmarks spec §5 extends the page and adds one
`/vs-<library>/` page per competitor, all under section 4.6's rule. The build time figures
render from the harness's `build` family, for example
`<Figure of="build.nexusdi.plain.tsc-6.median" />`.

`/decorators/` and the API reference are required for rc.0 (section 18.2).

### 4.4 Teaching order and fading

`_meta.ts` order is the teaching order (standard decision 19). A concept introduced on
page N carries a short reminder on page N+1, a shorter one on N+2 and none from N+3
(standard decision 2). The reminder is a clause or a parenthesis. It never repeats the
explanation and never links away.

| Concept                                                     | Introduced on          | Short reminder on       | Shorter reminder on     |
| ----------------------------------------------------------- | ---------------------- | ----------------------- | ----------------------- |
| `Nexus.create`, `get`, `provide(TOKEN, { useClass, deps })` | Getting started        | Tokens and interfaces   | Providers               |
| an interface and its `Token<T>`, `useValue`                 | Tokens and interfaces  | Providers               | Lifetimes               |
| the other provider forms, `static deps`, `optional()`       | Providers              | Lifetimes               | Modules                 |
| `singleton`, `transient`                                    | Lifetimes              | Modules                 | Configurable modules    |
| `defineModule`, `exports`, `has()`                          | Modules                | Configurable modules    | Scopes and REQUEST      |
| `with()`, `options`                                         | Configurable modules   | Scopes and REQUEST      | Lifecycle and disposal  |
| `createScope`, `scoped`, `REQUEST`                          | Scopes and REQUEST     | Lifecycle and disposal  | Lazy edges and cycles   |
| `onInit`, disposal order                                    | Lifecycle and disposal | Lazy edges and cycles   | Multi-providers         |
| `lazy()`                                                    | Lazy edges and cycles  | Multi-providers         | Errors                  |
| `MultiToken`, `all()`                                       | Multi-providers        | Errors                  | Introspection and trace |
| error codes, `BlueprintError`                               | Errors                 | Introspection and trace | none                    |

The example code follows the same order. The Getting started page binds one interface to one class
before the Tokens and interfaces page explains why, and every later page repeats the shape.
`ScoutDrone` takes only `COMPUTER` until the Scopes page, where `MISSION` joins its deps.
Section 7.2 lists every place the docs' ship differs from core spec §3.4.

Lookup pages sit outside this order. A question page, a platform guide, a contract page or
a reference page may name any concept and links to the page that introduces it.

### 4.5 Core's documentation commitments

Core spec promises nine things the docs will say. Each has a page and a heading, and
`apps/docs/commitments.json` holds the same table, which the `doc-commitments` guard
checks for the heading (section 14.3).

| Core spec line | Commitment                                                                            | Page and H2                                                                |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 254            | A class with default or rest parameters needs `provide(C, { deps })` or `@Injectable` | `/providers/`, "A class whose constructor has defaults or rest parameters" |
| 393            | Call `with()` once and import the result                                              | `/configurable-modules/`, "Call `with()` once and share the module"        |
| 466            | Resolve disposable transients inside a scope                                          | `/lifecycle/`, "A disposable transient belongs in a scope"                 |
| 818            | The `esnext.disposable` lib reference adds the disposable globals                     | `/getting-started/`, "TypeScript settings for NexusDI"                     |
| 1034           | A scoped factory runs once in every scope; on-demand work goes in a scoped class      | `/scopes/`, "A scoped factory runs in every shuttle"                       |
| 1110           | A factory hands ownership of its result to the container                              | `/lifecycle/`, "A factory's result belongs to the container"               |
| 1203           | Each error code links to a page that explains it                                      | `/api-errors/`, one H3 per code                                            |
| 1239           | Minifiers rename classes; use `Token` descriptions or `keepNames`                     | `/introspection/`, "Display names after minification", and `/bundlers/`    |
| 1301           | An untracked disposable transient is a leak; use a scope                              | `/lifecycle/`, "A disposable transient belongs in a scope"                 |

Line numbers are at `b5ab435`. The guard keys on the headings, so a later edit to the core
spec moves nothing here.

### 4.6 Every size and time figure comes from the benchmark harness

The owner's rule: every size and time figure on the site comes from the benchmark
harness, the landing page's bundle size included. No page states one by hand.

The source is the harness's results directory, `benchmarks/results/`, whose files the
benchmarks spec §4.9 declares in `benchmarks/src/schema.ts`, each carrying `schema: 1`:

| File                                                       | Holds                                                                                                                                                                                                                            | Figures in it                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `results/size.json` (`SizeFile`)                           | per library, variant and bundler (`esbuild`, `rollup`): `minified`, `gzip`, `polyfillGzip`, all in bytes, and whether the bundle `runs`                                                                                          | bundle size                    |
| `results/timings/<YYYY-MM-DD>-<sha7>.json` (`TimingsFile`) | per scenario (`cold-start`, `ready`, `resolve-singleton`, `resolve-transient`, `scope-cycle`), library and variant: `median` and `mad` in ns, optional `p99` and `heapBytes`, a `noisy` flag, with the runner, seed and versions | startup and resolve time       |
| `results/build.json` (`BuildFile`)                         | per library, variant and toolchain cell: the build's wall time as `median` and `mad`                                                                                                                                             | build time                     |
| `results/matrix.json` (`MatrixFile`)                       | per library, variant and toolchain cell: an outcome per lifetime section, the profile and the polyfill                                                                                                                           | no figures; the toolchain grid |
| `results/probes.json` (`ProbesFile`)                       | per library and wiring-mistake probe: where the mistake is detected                                                                                                                                                              | no figures; the probe table    |

`docs:benchmark-data` (`apps/docs/tools/benchmark-data.mjs`) reads the directory, validates
each file with `src/schema.ts`, and writes `apps/docs/generated/benchmark-data.json`
(gitignored), as benchmarks spec §4.11 specifies. A reader rejects a `schema` it does not
know. The newest timings file is the default, and a component takes a `run` prop to pin
another.

Pages render figures only through the benchmarks spec's components in
`apps/docs/components/benchmarks/`: `<Figure of="size.nexusdi.plain.esbuild.gzip" />`
inline, `<SizeChart />`, `<TimingChart />`, `<ToolchainGrid />`, `<ProbeTable />`, and
`<MeasuredWith />` for the versions, the runner and a link to the results file at its
commit. A `<Figure of>` path names a file, a library, a variant and a field, and a path the
data does not hold fails the build. A timing figure whose record is `noisy` shows the flag
beside it.

The landing page's bundle-size figure is
`<Figure of="size.nexusdi.plain.esbuild.gzip" />` with a link to `/comparison/`. Its
dependency count, 0, is a count and no size or time, so `docs:package-facts` still reads it
from `libs/core/package.json`.

`doc-benchmark-figures` (section 14.3) enforces the rule on every page.

## 5. Page anatomy per page type

### 5.1 Shared rules

Frontmatter carries `title`, `kind`, `description` (one sentence, used for search results
and the `<meta>` description) and, on a teaching page, `requires`: the slugs of the one or
two pages immediately before it in `_meta.ts`, rendered as the prerequisites box above the
first H2. Body prose never sends a reader to another page in the middle of a teaching
page (standard §2).

A page has exactly one `# ` heading. The first sentence of the page, and the first sentence
of every H2 section, names its subject and states what the subject does (public guidance
decision 21). On a concept page the concept is the grammatical subject of the page's first
sentence.

Every H2 section stands alone when cut out (standard §5a):

1. No pronoun reaches back past its own heading.
2. The heading names the package as well as the operation. On a one-package site the
   package is NexusDI, so a heading names NexusDI or the symbol it covers, for example
   "Configure `Comms` with `with()`". The reviewer applies this to every H2, as §5a
   states it.
3. Each fact sits next to the sentence that uses it.

Every TypeScript fence is a `file=… region=…` reference to a doctested region, a
`twoslash` fence, or a fence carrying one of the five exemption tags (`signature`,
`no-run`, `anti-example`, `fails-type-check`, `elided`). A shell fence is allowed. The
listing loader wraps a tagged fence in `<Listing>`, so the reader sees that nothing ran it
(standard §5).

A page carries at most two notices and never two adjacent ones. The labels are `Note`,
`Exception`, `Warning` and `Ship note` (public guidance decisions 7 and 8, with `Shop note`
renamed). An H2 section with more than one `Exception` says in its prose that the API it
describes is hard to remember (the third clause of decision 8). A Ship note may carry
Meridian narrative, and every rule it touches is also stated in the prose around it.

A diagram is a `mermaid` fence with a `caption` (the diagrams spec), coloured from the
Meridian tokens through the sentinel mechanism in the libraries repo's
`components/diagram/palette.ts`. The prose carries every fact the diagram shows.

Every page on `/next/` carries a release notice above its H1. The notice reads the newest
stable `@nexusdi/core@*` tag and the newest RC tag at build time, on the pattern of the
libraries repo's `release-state.ts`, and hard-codes no version. During the RC it reads
"This page documents `@nexusdi/core` 0.4.0-rc.2. The documentation for 0.3.1, the current
release, is at nexus.js.org." After final, `/next/` pages say they document `main` ahead
of the newest release, and root pages carry no notice.

### 5.2 Overview: the landing page

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
2. Two figures under the definition: the gzipped size of the Meridian-8 app built with
   NexusDI, rendered by `<Figure of="size.nexusdi.plain.esbuild.gzip" />` from the harness
   (section 4.6), and the dependency count, 0, which `apps/docs/tools/package-facts.mjs`
   reads from `libs/core/package.json`. [design pass]
3. The live specimen, `MeridianOnline`, beside the executed region it runs. The region is
   `await using ship = await Nexus.create(Meridian)` over the Meridian modules. The
   specimen replays the trace events of that call once on the graph view: providers light
   up level by level as `construct` events arrive, `init` events mark each singleton
   ready, and the panel ends on the full graph. The first replay uses the build-time
   fixture (section 10.3). "Replay" runs the region again in the shared runtime
   (section 11) and replays the events that run produced. Under `prefers-reduced-motion`
   the specimen renders the final graph with no replay. The server renders the final graph
   from the fixture, so a reader without JavaScript sees the same end state. An "Edit this
   in the Playground" link sits under it. [design pass: the panel frame, the glow on a
   node as it constructs]
4. "When to reach for it": an application with enough services that hand wiring hides
   mistakes until runtime, a server that needs per-request values, resources that must
   shut down in dependency order, and tests that replace one service without rebuilding
   the graph. A line says NexusDI needs no `reflect-metadata` and no compiler flag, with a
   link to `/comparison/`. [design pass: layout as cards]
5. "When to skip it": a script with a handful of objects, and a framework with its own
   container (NestJS, Angular), where NexusDI adds a second container beside the first.
6. Links to the four entry pages. [design pass: card treatment]

`MeridianOnline` is also mounted on `/introspection/`, so the specimen is reachable from a
section as standard decision 20 and G6 require.

### 5.3 Tutorial: Getting started

`/getting-started/` assumes nothing beyond the overview. It shows the install command
(`npm install @nexusdi/core@next` during the RC) and, in the same section, the ESM-only
note of section 5.3.1, then the TypeScript settings the reader needs
(TypeScript 5.4 or later, no `experimentalDecorators`, and what the `esnext.disposable` lib
reference adds), and one path that works end to end: the `IReactorCore` and
`IShipComputer` interfaces, their tokens `REACTOR` and `COMPUTER`,
`provide(REACTOR, { useClass: FusionReactor })`,
`provide(COMPUTER, { useClass: QuantumComputer, deps: [REACTOR] })`, one `defineModule`,
`Nexus.create`, a `get(COMPUTER)` and `await using`. Every step is an executed region. The page mounts one inline console whose
seed is the finished path.

#### 5.3.1 The ESM-only note

The note reads: "`@nexusdi/core` is published as ES modules only. A CommonJS project on Node 22.12 or
later can `require()` it." It sits in the install section of `/getting-started/` and in the
Node rows of `/runtimes/`, which add the details:

- Node 22.12.0 removed `require()` of an ES module from behind the
  `--experimental-require-module` flag, and Node 22.13.0 stopped printing the experimental
  warning by default (Node's modules documentation, "Loading ECMAScript modules using
  `require()`", version history, read 2026-09-23). Node 24 has both. On Node 22.0 to 22.11,
  which `engines` (`>=22`) still admits, a CommonJS project loads the package with
  `await import('@nexusdi/core')`.
- `require()` resolves with the conditions `node`, `require` and `module-sync`, and falls
  back to `default`. Core's `exports` map lists `default` beside `import` for every entry
  (core spec §12), so `require()` finds the build.
- `require()` returns the module namespace. The named exports read as they do in ESM:
  `const { Nexus, provide } = require('@nexusdi/core')`.
- `require()` fails with `ERR_REQUIRE_ASYNC_MODULE` on a module graph with top-level
  `await`. Core has none, and its packaging check keeps it that way (section 5.3.2).

#### 5.3.2 Evidence for the note

The `/runtimes/` row for CommonJS names its evidence like every other row. The evidence is a
CommonJS consumer in `scripts/verify-packaging.mjs` that calls `require('@nexusdi/core')`,
`require('@nexusdi/core/testing')` and `require('@nexusdi/core/node')` on Node 22.12 and
Node 24 and builds a container. That consumer belongs to core's packaging checks (core spec
§17), and until it exists the row reads "not tested".

### 5.4 Concept page

A concept page uses layout B (section 10). Its `_meta.ts` entry sets
`theme: { layout: 'full', toc: false }`, and its frontmatter sets `console: true`.
`app/(site)/[[...mdxPath]]/page.tsx` reads `metadata.console` and renders the page's MDX
inside a two-column grid: the prose column at the `measure` token's width, and the sticky
console. Nextra's own MDX `wrapper` stays in place, so the theme keeps its
`data-pagefind-body` region, its heading anchors and its previous and next links. An
end-to-end test asserts `data-pagefind-body` on a concept page.

The shape:

1. The H1 names the concept. The first two sentences name it again as their subject and
   state what it does.
2. The prerequisites box.
3. H2 sections, each teaching one facet in prose, an executed region and, where the shape
   needs it, a captioned `mermaid` fence. Each H2 section carries one `<ConsoleView>`
   whose `caption` says what the view shows, or a `<ConsoleExempt reason="…" />`
   (amendment A1).
4. Up to two notices, one of which may be a Ship note.

A concept page ends when its last H2 ends. It carries no recap and no "next steps" prose.

### 5.5 Question page

The H1 is the question a reader types. The first line of the answer names the method.
The page carries no prerequisites box. Where it needs a concept explained, it links to the
concept page and does not re-teach it. A question page may mount a console, and the
inventory lists the ones that do.

### 5.6 Platform guide

A platform guide documents how NexusDI is wired into one platform and links out for the
platform itself (the Astro scope fence the standard adopts in §3a). Code that needs a
running server carries `no-run`. The request handling the server calls is a doctested
region: `examples/meridian` runs it in Node with a fake request object. The page states
once that the demonstrable unit is a running server, so a reader does not look for a
console.

### 5.7 Contract page

`/upgrade-api-map/` has one H2 per 0.3 API, spelled as the 0.3 symbol. Each entry holds
the 0.4 equivalent, the codemod's handling (automatic, a TODO code, or unchanged) and a
before-and-after pair of fences. The "before" fence cites the codemod fixture's `input.ts`
and the "after" fence cites its `output.ts` (core spec §13.2). The codemod's own test runs
both. `/upgrade-behaviour/`, `/runtimes/` and `/comparison/` have one H2 per entry, and
each entry states its evidence beside it.

### 5.8 Reference page

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
region. A client filter above the entries renders every entry on first paint, hides with
`hidden` and never unmounts one (docs API reference decisions 18 and 32). Export kinds
take a hue from a `kind` token family in `meridian-ui` (decisions 27 to 31, with
`--meridian-kind` as the bound property). Reference pages are exempt from G8 by the
filename prefix `api`, following `2026-09-21-reference-page-budget.md` decision 3. That
spec is still proposed in the libraries repo, so this site adopts the exemption on its own
authority and records it in G8.

### 5.9 Blog post

Section 6.

### 5.10 Tool routes

The Playground and the Academy render full screen in `app/(tool)`, under the root layout's
fonts, theme and background, outside Nextra's `Layout`. Each carries a slim header with
the site name, a link back to the docs, the theme switch and the background pause switch
(section 16.1). Sections 11 and 13 give their contents.

## 6. Blog

### 6.1 During the RC

The blog stays on the 0.3 site at the root. `/next/` has no blog, and the new site's build
leaves `content/blog/` out whenever it builds for `/next/`.

The RC announcement is a Docusaurus Markdown post in `apps/docs/snapshot/blog/`, on
`main`. The snapshot workflow copies it into the 0.3 site's `blog/` directory before it
builds (section 15.2), so the post appears at a Docusaurus blog URL beside the two 0.3
posts and in the 0.3 site's own feeds. Every later RC update is one more file there and one
more snapshot run. The announcement bar on every 0.3 page is HTML with two links: one to
the newest RC post and one to `/next/upgrade/`.

The post covers what core spec §14's rc.0 checklist item 1 lists: what changed and why, the
codemod, how to install `@nexusdi/core@next`, the feedback channel, and the timeline to
0.4.0 final. The outline adds the 0.3 support policy of decision 27: `latest` stays on
0.3.x until final, and 0.3.x receives security, crash and data-loss fixes until the
`/v0.3/` retention ends.

### 6.2 From 0.4.0 final

The blog moves to `content/blog/` on the new site, entered from the navbar and outside the
sidebar. `content/_meta.ts` lists it as `blog: { type: 'page', title: 'Blog' }`, and
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
legacyUrl: /blog/2026/10/01/0-4-release-candidate
legacyId: https://nexus.js.org/blog/2026/10/01/0-4-release-candidate
```

`authors` names keys in `content/blog/authors.ts`, which holds each author's display name
and GitHub handle. `version` is the NexusDI version the post describes. A post whose
`version` is below 0.4.0 renders a header: "This post describes NexusDI `<version>`. The
API it shows changed in 0.4; the upgrade guide covers each change." with a link to
`/upgrade/`. A post from 0.4.0 on renders "Written for NexusDI `<version>`" under the byline.

The migration copies every post's text as it is, converts Docusaurus-only syntax (the
`<!--truncate-->` marker, admonitions) to the site's own, and records the old URL in
`legacyUrl` and the old feed entry id in `legacyId`. "Tabula Rasa" keeps `/blog/first-release/`,
the path it already had. The other posts move to `/blog/<slug>/`, and a redirect stub
answers at each old URL (section 15.6).

The index page `content/blog/index.mdx` mounts `<PostList />`, a server component that
reads `getPageMap('/blog')`, keeps the MDX pages whose frontmatter has `kind: post`, and
renders them newest first with title, date, authors, tags and description. Tags render as
chips. A client filter over the chips hides entries with `hidden` and never unmounts one,
so Pagefind indexes every entry. The site builds no per-tag pages while it has fewer than
ten posts.

`apps/docs/tools/blog-feed.mjs` writes the feeds in `postbuild`, the same position as the
`.md` sibling writer, from the same frontmatter the index reads. It writes Atom 1.0 at
`/blog/atom.xml` and RSS 2.0 at `/blog/rss.xml`, the two paths the Docusaurus blog
published, so an existing subscriber's reader keeps working with no redirect. A migrated
post's entry keeps its `legacyId` as the Atom `id` and the RSS `guid`, so a reader shows no
duplicate. A new post's id is a tag URI such as
`tag:nexus.js.org,2026:blog/0-5-release`.

### 6.3 Guards on posts

Amendment A2 sets the rules:

- G3 skips `post` pages, and a post's code carries `elided`.
- Posts whose `version` is below 0.4.0 are also skipped by G5, the domain guard and the
  refused-word guard. They keep their original text, 0.3 APIs, emoji and all.
- Posts from 0.4.0 on follow every other rule: the prose guards, the domain, G5 on their
  imports, G7, the `.md` sibling check and the notice budget.

## 7. Example domain: the Starship Meridian

Every example in `apps/docs/content`, every doctested region a page renders, every console
seed and every Academy mission is set on the Starship Meridian (standard §6). Core spec §3
already writes its examples in these names, so the docs and the spec share one vocabulary.

### 7.1 Canonical vocabulary

An example draws from this list and invents no neighbour. The code lives in
`examples/meridian`: `src/ship/` holds the finished ship, and `src/pages/<slug>/` holds
each page's code at the stage that page teaches.

Each service is an interface, a typed token named for the role, and one concrete class
bound to the token in one provider. A token's description is the role's name, so `graph()`
and the trace show `ReactorCore` and `ShipComputer` whatever class fills the role.

| Interface           | Token                                                      | Class                                 | Lifetime         | Bound in, with deps                                                                                                 |
| ------------------- | ---------------------------------------------------------- | ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `IReactorCore`      | `REACTOR = new Token<IReactorCore>('ReactorCore')`         | `FusionReactor`                       | singleton        | `Engineering`, no deps                                                                                              |
| `IShipComputer`     | `COMPUTER`, described `'ShipComputer'`                     | `QuantumComputer`                     | singleton        | `Engineering`, `[REACTOR]`                                                                                          |
| `IPowerRouter`      | `POWER_ROUTER`, described `'PowerRouter'`                  | `PlasmaRouter`                        | singleton        | `Engineering`, `[lazy(SHIELDS)]`                                                                                    |
| `IShieldGrid`       | `SHIELDS`, described `'ShieldGrid'`                        | `DeflectorGrid`                       | singleton        | `Engineering`, `[POWER_ROUTER]`                                                                                     |
| `ISubspaceLink`     | `SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink')` | `SubspaceRelay` or `LaserLink`        | singleton        | `Comms`, chosen by the `transport` option (section 7.3)                                                             |
| `INavCharts`        | `NAV_CHARTS: Token<INavCharts>`                            | an async factory                      | singleton        | `Tactical`, `provide(NAV_CHARTS, { useFactory: async (link) => StarCharts.download(link), deps: [SUBSPACE_LINK] })` |
| `ISurveyDrone`      | `DRONE`, described `'SurveyDrone'`                         | `ScoutDrone`                          | transient        | `Tactical`, `[COMPUTER]`, and `[COMPUTER, MISSION]` from the Scopes page on                                         |
| `IFlightLog`        | `FLIGHT_LOG = new Token<IFlightLog>('FlightLog')`          | `ShuttleFlightLog`                    | scoped           | `BridgeApi`, which imports `Tactical` for `MISSION`: `useClass: ShuttleFlightLog, deps: [MISSION]`                  |
| `IDiagnosticsPanel` | `DIAGNOSTICS_PANEL`, described `'DiagnosticsPanel'`        | `StatusBoard`                         | singleton        | `Meridian`, `[all(DIAGNOSTICS), optional(SUBSPACE_LINK)]`                                                           |
| `Diagnostic`        | `DIAGNOSTICS`, a `MultiToken<Diagnostic>`                  | `ReactorDiagnostic`, `hullDiagnostic` | singleton, value | `Engineering` and `Tactical`                                                                                        |
| `Mission`           | `MISSION`, a `Token<Mission>`                              | a factory over `REQUEST`              | scoped           | `Tactical`, `[REQUEST]`                                                                                             |
| `CommsOptions`      | `COMMS_OPTIONS`                                            | the `with()` value                    | none             | `Comms`                                                                                                             |

The rest of the vocabulary:

| Thing            | The name                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The ship         | The Starship Meridian, whose root module is `Meridian`.                                                                                                                                       |
| The container    | `ship`, the variable that holds `await Nexus.create(Meridian)`.                                                                                                                               |
| A scope          | A shuttle launched from the bay: `await using shuttle = await ship.createScope({ request })`. Scope ids are `s0`, `s1`.                                                                       |
| A mission        | `{ id: 'survey-7', target: 'Kepler-442b' }`.                                                                                                                                                  |
| Disposal         | A reactor scram: `FusionReactor[Symbol.asyncDispose]()` drops the control rods.                                                                                                               |
| Modules          | `Engineering`, `Tactical`, `Comms`, `BridgeApi` and the root `Meridian`, which imports `Tactical` and `BridgeApi`. `SimulatorEngineering` is the module a swap puts in `Engineering`'s place. |
| Decorator sugar  | `Bridge`, with `@Inject(NAV_CHARTS) accessor charts: INavCharts`, in the `Command` module.                                                                                                    |
| Test doubles     | `FakeReactor implements IReactorCore`, `MemoryFlightLog implements IFlightLog`, `LoopbackLink implements ISubspaceLink`, `CommsStub`, `fakeCharts`, `passingDiagnostic`.                      |
| A server request | `IncomingRequest` with a `mission` field, handled by `dispatch(req)`.                                                                                                                         |

### 7.2 Differences from core spec §3.4

The finished ship in `src/ship/` differs from core spec §3.4 in five places, each for a
teaching reason:

1. Every service is bound through an interface token (section 7.3). Core §3.4 uses classes
   as their own tokens. That form is valid NexusDI, and the Tokens and interfaces page
   states it in prose and shows no example of it.
2. `ScoutDrone` takes only `COMPUTER` on the pages before Scopes, so the Lifetimes page
   teaches a transient before a scope exists.
3. The diagnostics panel lives in `Meridian`, and `Tactical` exports `DIAGNOSTICS`, so the
   Multi-providers page and mission 9 can show a multi token crossing a module boundary.
   In core §3.4 the panel lives in `Engineering`.
4. `FLIGHT_LOG` and the `BridgeApi` module that binds it are new. Core §3.4 has no scoped
   class, and the Scopes page needs one. The integrations spec binds `FLIGHT_LOG` in
   `BridgeApi` too, so the docs and that spec share the name and the binding.
5. `Comms` takes a `transport` option beside `frequency`, and its `schema` is a valibot
   schema,
   `v.object({ frequency: v.pipe(v.number(), v.integer(), v.minValue(1)), transport: v.picklist(['relay', 'laser']) })`,
   which implements Standard Schema V1, so core validates it through `~standard.validate`
   with no valibot-specific code. Core spec §3.4 leaves the validator open.
   `examples/meridian` pins `valibot` at `1.5.0` exactly, as a dependency of the examples
   only, and the sandbox runtime carries the same version (section 11.4). `/schemas/`
   shows the same module configured with zod and with ArkType, each a doctested region in
   `examples/meridian`, which pins both as dev dependencies.

### 7.3 The interface-first rule

Every example in the docs, in a post from 0.4.0 on, in a Playground seed and in an Academy
mission follows four rules:

1. Each service has an interface and a typed token: `interface IReactorCore` with
   `REACTOR = new Token<IReactorCore>('ReactorCore')`, `NAV_CHARTS: Token<INavCharts>`,
   `FLIGHT_LOG: Token<IFlightLog>`.
2. Each concrete class is bound in exactly one provider of a program. A class the
   container constructs is bound with `useClass`. `SubspaceRelay` and `LaserLink`, which
   `Comms` chooses between by its `transport` option, are each constructed in that
   module's one `SUBSPACE_LINK` factory, over `[COMMS_OPTIONS]`.
3. A consumer declares its deps as tokens, and its constructor parameters take the
   interfaces: `QuantumComputer`'s constructor takes `reactor: IReactorCore`, and its
   provider declares `deps: [REACTOR]`.
4. No concrete class depends directly on another concrete class.

The rules pay off in three overrides, which recur through the pages and the missions:

- A module swap. `SimulatorEngineering` binds `REACTOR` to `SimulatedReactor` and exports
  the same tokens as `Engineering`, so a `Meridian` that imports it builds with no other
  change (the Modules page, mission 4).
- A test override.
  `createTestingContainer(Meridian).override(REACTOR, { useClass: FakeReactor })` puts a
  fake reactor under an unchanged `QuantumComputer` (`/testing/`, missions 1 and 7).
- A configurable module that picks an implementation.
  `Comms.with({ frequency: 1420, transport: 'laser' })` binds `SUBSPACE_LINK` to a `LaserLink` (the
  Configurable modules page, mission 5).

`doc-interface-first` (section 14.3) checks the rules a pattern can reach, and the
reviewer checks the rest.

### 7.4 Where it binds

The domain binds on every teaching page, every question page, every platform guide, every
post from 0.4.0 on, the Academy and the Playground seeds. A reference page takes it as the
default and may use a shorter example where a Meridian noun makes the example longer than
its point (standard §6). Migration pages show 0.3 code as the codemod fixtures hold it, so
their "before" fences keep the 0.3 names.

Domain colour appears in three places: a Ship note, an example, and page furniture (a
console caption, a mission title, an Academy failure message). A sentence that states a
rule uses NexusDI's own terms. "A scoped provider is built once per scope" is a rule. "The
shuttle keeps its own flight log" is colour, and it goes in a Ship note or a caption beside
the rule. No page carries humour, an idiom, a holiday, a season or a sport, in prose, a
heading or an example (public guidance decision 16). A Meridian noun is a name and carries
no joke.

### 7.5 Declaring deps

NexusDI 0.4 accepts four ways to declare a class's deps, and the Providers page shows them
in this order:

1. `provide(COMPUTER, { useClass: QuantumComputer, deps: [REACTOR] })`, the form every
   other page uses and the one the docs recommend. TypeScript checks the deps tuple against
   the constructor (core spec §4.3).
2. An object-literal provider,
   `{ token: COMPUTER, useClass: QuantumComputer, deps: [REACTOR] }`, which takes the
   fields of `provide()`'s options plus `token`, with `useValue`, `useClass`, `useFactory`
   or `useExisting`, and optional `deps` and `lifetime`. It suits providers built from data.
3. `static deps = [REACTOR] as const` on a plain class, which the class carries wherever it
   is bound.
4. `@Injectable({ deps: [REACTOR] })`, the decorator sugar on `/decorators/`.

NexusDI has no mode that reads `emitDecoratorMetadata` or `reflect-metadata`. The
Providers, `/decorators/`, `/legacy-decorators/` and `/comparison/` pages each say so where
a reader from another container would look for it.

### 7.6 Per-concept mapping

| Concept page            | The Meridian example                                                                                                                                                                        | What the console shows                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Getting started         | `IReactorCore` bound to `FusionReactor`, and `QuantumComputer` taking it through `deps: [REACTOR]`.                                                                                         | The two-node graph.                                                                                 |
| Tokens and interfaces   | `NAV_CHARTS` types the `INavCharts` interface and gets a `useValue`. Two tokens described `'NavCharts'` stay distinct. A `FakeReactor` value shows that a consumer sees only the interface. | The graph with every node named by its token.                                                       |
| Providers               | `useClass` with deps, `NAV_CHARTS` by an async factory over `SUBSPACE_LINK`, an alias, an optional `SUBSPACE_LINK`, the object-literal form and `static deps`.                              | The graph with each provider kind marked, and the plotted course from `NAV_CHARTS`.                 |
| Lifetimes               | Two `get(DRONE)` calls launch two `ScoutDrone`s that share one `COMPUTER`.                                                                                                                  | A trace replay: two `construct` events for the drone, one for the computer.                         |
| Modules                 | `Engineering` exports `COMPUTER` and keeps `POWER_ROUTER` private. `Tactical` imports `Engineering`. `SimulatorEngineering` takes `Engineering`'s place.                                    | The graph grouped by module, `NEXUS_NOT_VISIBLE` on a private token, then the swapped reactor.      |
| Configurable modules    | `Comms.with({ frequency: 1420, transport: 'laser' })`, a `with({ deps, useFactory })` variant, and a schema that rejects a negative frequency.                                              | The chosen `LaserLink`, then the schema's issues.                                                   |
| Scopes and REQUEST      | Two shuttles with two missions, each with its own `FLIGHT_LOG`, sharing the ship's `COMPUTER`.                                                                                              | A trace replay with lanes `s0` and `s1`.                                                            |
| Lifecycle and disposal  | `QuantumComputer.onInit()` runs a self-test. `await using` ends in a reactor scram, after the computer shuts down.                                                                          | A replay of `init` events and of the `dispose:instance` events in order.                            |
| Lazy edges and cycles   | `SHIELDS` and `POWER_ROUTER` form a cycle. `lazy(SHIELDS)` breaks it.                                                                                                                       | The cycle drawn as a ring with `NEXUS_CIRCULAR_DEPENDENCY`, then the graph with a dotted lazy edge. |
| Multi-providers         | `Engineering` and `Tactical` contribute to `DIAGNOSTICS`, and `DIAGNOSTICS_PANEL` in `Meridian` reads `all()`.                                                                              | The fan-in of `all` edges into the panel.                                                           |
| Errors                  | A Meridian with a missing export, a cycle and a captive `MISSION`.                                                                                                                          | The error view: every error in one list, the cycle drawn as a ring.                                 |
| Introspection and trace | The full Meridian.                                                                                                                                                                          | `MeridianOnline` and a full trace replay, with the `graph()` JSON beside it.                        |

### 7.7 The abandoned domains

The domain guard (section 14.3) holds fences to a deny list of the nouns the 0.3 site
used, counted at `6d5e4f3`: `UserService`, `UserModule`, `UserRepository`,
`DatabaseService`, `DatabaseModule`, `EmailService`, `LoggerService`, `LoggingModule`,
`OrderService` and `AppModule`, plus the interface pattern `/\bI[A-Z]\w*Service\b/`. The
Meridian's own interfaces are named for their role and none ends in `Service`, so the
pattern matches none of them: `IReactorCore`, `IShipComputer`, `IPowerRouter`,
`IShieldGrid`, `ISubspaceLink`, `INavCharts`, `ISurveyDrone`, `IFlightLog` and
`IDiagnosticsPanel`. The guard's fixture test asserts that list passes and that
`IUserService` fails. The same list holds
the 0.3 API names that 0.4 removes: `@Service`, `@Provider`, `DynamicModule`,
`createChildContainer`, `TokenType`, `ContainerException`, `NoProvider`, `configAsync`,
`forRoot` and `new Nexus()`. The Migration band and pre-0.4.0 posts are exempt, because both
name 0.3 code on purpose.

## 8. Visual identity and tokens

Direction D, "Deep space HUD", sets the look: a deep navy field with a nebula drifting
behind glass panels, cyan and magenta signal colours, thin geometric markers and a
geometric grotesque for display type. `internal/meridian-ui` holds the tokens. Values
marked [design pass] are proposals the visual design pass may move, inside the contrast
floors this section sets.

### 8.1 The package

`internal/meridian-ui`, package `@nexusdi/meridian-ui`, mirrors `internal/baize-ui`
(baize-ui spec §§1 to 5):

- `src/tokens/*.ts` is the source. `tools/generate-tokens.ts` writes
  `src/tokens.generated.css`, which is committed, and `tokens-generated.test.ts`
  regenerates it and compares byte for byte.
- Four entries: `.` (the stateless components), `./tokens` (values, no React),
  `./styles.css` (the custom properties and component classes) and `./background` (the
  background module, section 9, no React).
- Components import only `createElement` and `Fragment` from `react`. A source scan and
  the packed-output check hold that allowlist (baize-ui spec §5).
- The tokens name the font families, and the package holds no font files. The docs app
  self-hosts the fonts through `next/font`.
- The package lives under `internal/`, outside `nx.json`'s `release.projects` (`libs/*`),
  so `nx release` never versions it. Its `package.json` carries `private: true`.

The components are `Panel` (the glass surface), `Notice` with a `kind` prop for the four
notice labels, `ConsoleFrame` (the console's chrome: a title row, a tab strip slot, a body
slot) and `Marker` (the thin geometric marks: a corner bracket, a tick rule and a lifetime
glyph). A stateful piece, such as the console's section tracking or the editor, belongs to
the docs app (the baize-ui boundary rule).

### 8.2 Colour roles

Every text role sits on a reading surface. No text renders directly over the background
canvas. The dark surface is `#0b1030` at 86% opacity with a backdrop blur. The dark
contrast column is measured against the worst composite: that surface over a pure white
background pixel, which is `#2d314d`. White is the brightest pixel any nebula frame can
put behind the surface, so the floor holds for every frame of the animation.

The light column is measured on `#e6eaf7`, the darkest light ground, which is darker than
any light surface composite, so its figures are floors. `control-border` in light mode is
measured on the light surface composite, `#fdfdfe` (white at 92% over `#e6eaf7`), because a
control border sits on a surface.

| Role               | Dark          | Light         | Dark, worst composite | Light           |
| ------------------ | ------------- | ------------- | --------------------- | --------------- |
| `space-0` (ground) | `#070a1c`     | `#f4f6fc`     | n/a                   | n/a             |
| `space-2` (ground) | `#1a2150`     | `#e6eaf7`     | n/a                   | n/a             |
| `hull` (surface)   | `#0b1030` 86% | `#ffffff` 92% | n/a                   | n/a             |
| `hull-raised`      | `#161d48` 92% | `#ffffff`     | n/a                   | n/a             |
| `rule` (hairline)  | `#2a3470`     | `#cfd5ee`     | decorative only       | decorative only |
| `control-border`   | `#6b78c8`     | `#7f89b0`     | 3.10:1                | 3.38:1          |
| `text`             | `#e8edff`     | `#0b1030`     | 10.85:1               | 15.45:1         |
| `text-secondary`   | `#aab4e0`     | `#3a4470`     | 6.22:1                | 7.80:1          |
| `text-tertiary`    | `#8e99cc`     | `#4f5a8a`     | 4.57:1                | 5.53:1          |
| `signal-cyan`      | `#5eeaff`     | `#006b85`     | 8.86:1                | 5.08:1          |
| `signal-magenta`   | `#ff5ec8`     | `#b0006e`     | 4.64:1                | 5.69:1          |
| `signal-amber`     | `#ffc75e`     | `#8a5a00`     | 8.19:1                | 4.93:1          |
| `status-pass`      | `#5effa8`     | `#0a7040`     | 9.86:1                | 5.13:1          |
| `status-fail`      | `#ff7b7b`     | `#b3261e`     | 5.05:1                | 5.44:1          |
| `nebula-violet`    | `#8b6cff`     | none          | background only       | n/a             |

The lifetime roles reuse the signal colours: `singleton` is cyan, `scoped` is magenta,
`transient` is amber, and a provider with no lifetime (a value or an alias) takes
`text-secondary`. The graph view carries every lifetime as a text label, and the colour
repeats that label (section 12).

`meridian-ui`'s token test computes each ratio in this table from the values with the
WCAG 2.1 formula (the libraries repo's `contrast.ts`), with the composites above, and
fails when a text role falls below 4.5:1 or `control-border` below 3:1. The floor is
written beside each value in the token file.

### 8.3 Type

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

### 8.4 Spacing, radii, elevation, motion

The spacing scale has eight steps, in rem: `1` 0.25, `2` 0.5, `3` 0.75, `4` 1, `5` 1.5,
`6` 2, `7` 3, `8` 4. The prose `measure` is 64ch.

Radii by role: `panel` 14px, `control` 8px, `chip` 4px, `marker` 0. The geometric markers
are square-cornered on purpose, so a marker never reads as a control. [design pass]

Elevation has two steps. `glass` is a 1px inner hairline at `signal-cyan` 12% plus
`0 12px 32px -16px rgb(0 0 0 / 0.8)`. `raised` adds a second, tighter shadow for the
console and dialogs. Focus is a 2px `signal-cyan` ring at 2px offset in dark mode and
`#006b85` in light mode.

Motion has two tiers. Interaction motion (hover, focus, a disclosure opening) runs at 140ms
on `cubic-bezier(0.2, 0.8, 0.3, 1)`. Console motion (a view transition, a trace step) runs
at 200ms on the same curve. The background's periods are in section 9. Under
`prefers-reduced-motion: reduce` every duration is 0ms and the background renders one
static frame.

### 8.5 Light mode

Nextra keeps its light and dark toggle, and the site follows the reader's system setting by
default. Light mode is the same roles on a pale hull: the ground is a static gradient from
`#f4f6fc` to `#e6eaf7`, the surfaces are white at 92%, and the signal colours darken to the
ink values in section 8.2. The background module renders no nebula in light mode, so light
mode has one static ground and one set of contrast values to test. The geometric markers,
the glass panels and the layout stay, so a reader who switches themes stays on a site they
recognise.

### 8.6 The Nextra remap

`apps/docs/app/global.css` follows the libraries repo's three-surface remap:

1. `--nextra-bg` and the primary hue reach the theme through `<Head>` props, derived from
   the tokens in `app/meridian-theme.ts` (the libraries repo's `baize-theme.ts` pattern).
   The primary hue is `signal-cyan`'s in dark mode and its ink value's in light mode.
2. Tailwind v4's `gray`, `neutral` and `slate` steps map onto the Meridian roles, one
   mapping for the steps `nextra-theme-docs/dist/style.css` uses, read out of the installed
   stylesheet.
3. Headings take the display family through a rule scoped to the article.

The ground gradient paints on `html`, and `body` has a transparent background in both
themes, so the fixed background canvas at `z-index: -1` shows between `html` and the page's
surfaces. Nextra's `<Head backgroundColor>` would paint `body` opaque, so `global.css`
sets `body { background: transparent }` after the theme stylesheet, and a Playwright test
reads the computed value.

The `meridian-ui` component classes read `--meridian-*` properties and nothing else.
`global.css` binds those properties per theme on `html` and `html.dark`, as the libraries
repo binds `--baize-*`.

## 9. Background module

The background is a nebula of soft cyan, magenta and violet clouds that drift and swell
very slowly, with a field of stars that also drifts. It sits behind every page as
decoration and carries no information.

### 9.1 Shape

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
CSS scales up. The upscale blurs the clouds, which gives them soft edges. The stars
are 150 to 400 point sprites, scaled by viewport area, drawn in the same pass. When WebGL2
is unavailable or the context is lost, the module draws one static frame with canvas 2D (a
radial gradient per cloud and the star field) and stops.

### 9.2 Motion

The clouds translate on periods of 120 to 240 seconds and swell in opacity on periods of
12 to 20 seconds. Stars drift at 0.5 to 3 CSS pixels a second, slower for dimmer stars.
Nothing moves fast enough to draw the eye while a reader is reading.

### 9.3 When it runs

- The module starts after the page's `load` event, inside `requestIdleCallback` (with a
  2-second timeout fallback), so the content paints first and the largest contentful
  paint never waits on it.
- Under `prefers-reduced-motion: reduce` it renders one frame and never starts a loop. It
  listens for the media query and stops or starts when the setting changes.
- In a hidden tab (`document.visibilityState === 'hidden'`) it cancels its frame request
  and clears its timers. It resumes on `visibilitychange`.
- It renders at 30 frames a second at most. With no pointer, key, scroll or touch event
  for 30 seconds, it drops to 10. On battery, where `navigator.getBattery()` reports
  `charging: false`, it caps at 15. Browsers without the Battery API get the 30 cap.
- With `navigator.connection.saveData` set, it renders one frame and stops.
- With the reader's "Pause background" switch on (section 16.1), it renders one frame and
  stops.
- In light mode it renders nothing and leaves the CSS gradient.

### 9.4 Budget

| Budget                                | Limit                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------ |
| JavaScript                            | 8 kB gzipped for the module, shaders included                            |
| Main-thread time                      | 1 ms a frame at the 30 fps cap, 3% of main-thread time over 10 seconds   |
| GPU                                   | one pass, a quarter-resolution target, at most four noise octaves        |
| Long tasks attributable to the module | none over 50 ms                                                          |
| Memory                                | one render target and one vertex buffer, no textures loaded from network |
| Network                               | none                                                                     |

CI measures the JavaScript size from the built chunk and the main-thread time from a
Playwright trace (section 17). CI cannot observe GPU time, so the GPU row is a set of
design limits the review holds.

## 10. Ship console

The ship console is the control on a concept page: the live graph, a specimen or a trace
replay for the section in view, with an "Edit this in the Playground" link.

### 10.1 Authoring

An author places one `<ConsoleView>` in each H2 section of a concept page:

```mdx
<ConsoleView
  seed="scopes/two-shuttles"
  view="trace"
  caption="Two shuttles each build their own MISSION and FLIGHT_LOG, and share one COMPUTER."
/>
```

`seed` names a console seed (section 11.9). `view` is `graph`, `trace` or `specimen`.
`caption` is required and states in words what the view shows, so the teaching layer
carries the view's claim and a reader without JavaScript loses nothing (standard §5, the
two-layer rule). G4 fails a `ConsoleView` without a caption, as `diagram-captions.test.ts`
does for a diagram. An H2 section with nothing for the console to show carries
`<ConsoleExempt reason="…" />` (amendment A1).

### 10.2 Behaviour

On a screen at least 1280 CSS pixels wide, the concept page renders the two-column grid
of section 5.4. The console panel sits in the right column with `position: sticky` below
the navbar. An `IntersectionObserver` over the H2 sections, in docs code, picks the section
nearest the top of the viewport, and the console shows that section's view. Above the
first H2, the console shows the first section's view.

Below 1280 pixels, each `ConsoleView` renders inline at the position the author placed it,
as a specimen card with the same content.

The console's header shows the section heading it follows, a tab strip for the view kinds
the seed supports, a "Run" control and "Edit this in the Playground". Run executes the
seed in the shared runtime (section 11) and replaces the static view with the live result.
"Edit this in the Playground" links to `/playground/?seed=<seed>`.

### 10.3 Without JavaScript

The server renders each view from a build-time fixture. `apps/docs/tools/console-fixtures.mjs`
runs every console seed in Node against the workspace-built `@nexusdi/core`, records
`graph()`, the trace events, the console output and any thrown error, sets every
`durationMs` to 0 so the HTML is identical between builds, and writes one JSON file per
seed. The views render that JSON to static SVG and markup. The live runtime loads only
when the reader presses Run or opens the editor.

### 10.4 Composition with `@evanion/react-widget`

The console's panels are widget items. `apps/docs/components/console/widgets.tsx` calls
`createWidgets` once, at module scope, with a component map (`graph`, `trace`,
`specimen`, `log`, `errors`, `json`) and an item chrome typed with
`WidgetItemComponent<ConsoleMeta>`, where `ConsoleMeta` is
`{ area: 'main' | 'side' | 'strip'; tab?: string }`. The chrome reads `meta` and places
the panel. It sets `chrome.suspense: 'none'`, because every panel renders synchronously
and the libraries repo measured that a streamed boundary on a static export outlines
content into a hidden `div` that Pagefind indexes out of order.

The pattern is the libraries landing page's:

- The static view is a server component that builds items from the fixture JSON and
  renders `<Widgets>`, as `app/(site)/page.tsx` does there.
- After Run, a client component holds the items in state, as `DataDemo.tsx` does, and
  replaces them with items built from the run's messages.

The Academy's two modes (section 13.3), the progress dashboard (section 13.7) and the
next-mission recommendation (section 13.7) use the same library with their own component
maps and `meta` vocabularies. The recommendation is a client component that reads
IndexedDB, computes the next mission, and renders it as an item.

`apps/docs/package.json` pins `"@evanion/widget": "0.1.0"` and
`"@evanion/react-widget": "0.3.0"` exactly. A bump is a pull request a person opens, and
the Playwright visual checks run on it. Scroll tracking, in-view tracking and the
IntersectionObserver stay docs code; the widget libraries render and place, and nothing
else.

### 10.5 View transitions

A console view change, an Academy mode change and a trace step animate through native
View Transitions. React 19.3.0 exports `ViewTransition` as a stable export (checked in the
libraries repo's `node_modules/react/cjs/react.production.js`). The console wraps its panel
area in `<ViewTransition>` and applies each view change inside `startTransition`, which is
what triggers the animation. `@evanion/react-widget` needs no change: the transition
wraps the `<Widgets>` it renders.

Where the browser lacks `document.startViewTransition`, React applies the update with no
animation. Under `prefers-reduced-motion: reduce`, `global.css` sets
`animation: none` on the `::view-transition-*` pseudo-elements, so the swap is instant.
Phase 1 checks the export under Next 16's static export. If the check fails, the console
calls `document.startViewTransition(() => flushSync(update))` itself, with the same
reduced-motion rule.

### 10.6 Page weight

Nothing in the runtime loads before the reader interacts. The static views are SVG and
markup in the page's HTML. The console island, which does the section tracking, the tabs,
the widget rendering and the trace replay, is limited to 35 kB gzipped (section 16.2).

## 11. Playground runtime

One runtime serves the console, the Playground and the Academy. It lives in
`apps/docs/components/runtime/`, and each surface mounts it with a different frame.

### 11.1 Architecture

```
 page (nexus.js.org)                          Web Worker (same origin)
 ┌──────────────────────────────┐   files    ┌───────────────────────────────┐
 │ CodeMirror 6 editor          │ ─────────▶ │ TypeScript 6.0.3              │
 │ console / graph / trace view │ ◀───────── │ @typescript/vfs environment   │
 │ run controller               │ diagnostics│ type-check, transpile, guard  │
 └──────────────┬───────────────┘ + JS       └───────────────────────────────┘
                │ srcdoc: import map + CSP + boot script
                ▼
 ┌──────────────────────────────┐
 │ <iframe sandbox="allow-scripts">  opaque origin, one per run
 │ harness → @nexusdi/core (runtime/core-<hash>/)
 │ reader's modules as data: URLs
 └──────────────┬───────────────┘
                │ postMessage (protocol v1)
                ▼
          run controller
```

The editor sends the reader's files to the worker. The worker returns diagnostics and
emitted JavaScript. The run controller builds a fresh sandboxed iframe for each run, and
the iframe reports back over `postMessage`. The worker never runs the reader's code, and
the iframe never sees TypeScript.

### 11.2 The TypeScript worker

The worker bundles `typescript@6.0.3`, the version the workspace pins, and
`@typescript/vfs`. Next's bundler emits it as its own chunk through
`new Worker(new URL('./ts.worker.ts', import.meta.url))`, so no page loads it until the
runtime creates the worker. A test asserts that the worker's `ts.version` equals the root
`package.json`'s `typescript` version.

Phase 1 checks that this pattern works under Turbopack with `output: 'export'` and
`basePath: '/next'` (section 18.1). The fallback, if it does not: `docs:runtime-assets`
writes a minified `typescript.js` and an esbuild bundle of the worker and
`@typescript/vfs` to `public/runtime/`, content-hashed, and the runtime starts a classic
worker that loads TypeScript with `importScripts`.

The worker builds one `createVirtualTypeScriptEnvironment` per editor session over the
bundled declarations (section 11.3) and the reader's files. The review measured 283 ms to
create the environment in Node, and a browser worker runs two to three times slower, so
the editor shows "Loading the type checker" until the first diagnostics arrive. On every
change, debounced to 300 ms, the worker returns the semantic and syntactic diagnostics for
every file. The editor draws them as squiggles through `@codemirror/lint`, with the message
and the code on hover and in the lint panel.

On Run, the worker transpiles each file with the same compiler options and a custom
transformer that rewrites relative imports between the reader's files (`./engineering.js`)
into bare specifiers (`@ship/engineering`) and inserts the loop guard (section 11.6). It
emits a source map per file and keeps it for the run controller (section 11.5).

The compiler options live in one module, `apps/docs/components/runtime/compiler-options.ts`:
`target: 'es2022'`, `module: 'esnext'`, `moduleResolution: 'bundler'`, `strict: true`,
`lib: ['es2023', 'esnext.disposable']`, no `experimentalDecorators`, plus one ambient file,
`runtime-globals.d.ts`, which declares `console`, the timer functions, `queueMicrotask` and
`performance.now`. The site's twoslash fences compile in the same environment (section
14.2), and a test asserts that both read this module.

### 11.3 Declarations

`apps/docs/tools/playground-types.mjs` runs before `next build`. It collects the TypeScript
lib files the options name, following each `/// <reference lib>` chain in
`node_modules/typescript/lib`, plus `runtime-globals.d.ts` and the published declarations of
`@nexusdi/core` and `@nexusdi/core/testing` from `libs/core/dist`, and valibot's
`dist/index.d.mts` from the pinned `valibot@1.5.0`. It writes one JSON file,
`public/runtime/types-<hash>.json`, mapping each virtual path to its contents. The hash is
the SHA-256 of the contents, so a new core build or a TypeScript bump changes the URL.

The `dom` lib is left out. The review measured the TypeScript 6.0.3 lib chain with `dom`
at 63 files and 414 kB gzipped, of which `dom` alone is about 360 kB. Without it, and with
the ambient file, the TypeScript and core declarations come to about 55 kB gzipped.
valibot's declarations add 52 kB gzipped, measured on `valibot@1.5.0`, so the JSON file is
about 107 kB. A seed that needs a DOM API is out of scope for a DI playground.

`@nexusdi/core/node` is left out too. It imports `node:async_hooks`, which no browser has,
so the Node request guide keeps its server code in doctested regions that run in Node.

### 11.4 The sandbox

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
2. An import map. During the RC it reads:

   ```json
   {
     "imports": {
       "@nexusdi/core": "https://nexus.js.org/next/runtime/core-<hash>/harness.js",
       "@nexusdi/core/testing": "https://nexus.js.org/next/runtime/core-<hash>/harness-testing.js",
       "valibot": "https://nexus.js.org/next/runtime/valibot-1.5.0/index.min.mjs",
       "@ship/engineering": "data:text/javascript;base64,…",
       "@ship/main": "data:text/javascript;base64,…"
     }
   }
   ```

   The parent writes the URLs from its own `location.origin` and the build's base path.
   `runtime/core-<hash>/` is a copy of `libs/core/dist` made by
   `apps/docs/tools/runtime-assets.mjs` before `next build`, so the code a reader runs is
   the code the workspace built and tested at that commit. No example loads anything from
   npm. Core's build emits ESM with explicit `.js` extensions (`4929328`), so the browser
   loads its relative imports as they are. `runtime/valibot-1.5.0/index.min.mjs` is
   valibot's own minified ESM build, copied from the pinned package by the same script. It
   is one self-contained module of 84.6 kB, 14.7 kB gzipped, and the frame loads it only
   when the reader's code imports `valibot`. The version sits in the path, so a bump
   changes the URL.

3. `<script type="module" src="<origin><basePath>/runtime/core-<hash>/boot.js">`, which
   imports `@ship/main` and reports results. Apart from the hashed import map the document
   carries no inline script, so the CSP needs no `'unsafe-inline'`.

`harness.js` imports core's real `index.js`, patches two methods on the real `Nexus`
class, and re-exports the module. No subclass exists, so `instanceof Nexus` holds for every
container the reader builds. The static `create` gains a `trace` callback that posts every
event and then calls the reader's own `trace`, and it posts `ship.graph()` after `create`
resolves. `Nexus.prototype.load` posts `graph()` after each `load()` resolves. Core's
`testing` entry imports the same `index.js` URL, so a testing container runs through the
patched class. `harness-testing.js` re-exports `testing/index.js` and wraps the builder's
`create`, so a testing container posts its graph the same way. The reader's types come
from the real declarations, and the harness changes no behaviour a reader can observe
apart from the reports.

The review probed this design in Chromium, Firefox and WebKit, and every point held: the
import map with `data:` targets, the hashed CSP, a module fetch that carries
`Origin: null`, `connect-src 'none'` refusing a `fetch`, and a `SecurityError` on
`parent.document` and on `indexedDB`. nexus.js.org is served through Cloudflare, which
passes the Pages response with `Access-Control-Allow-Origin: *` and
`Cache-Control: max-age=600`, and that header satisfies the CORS module fetch from the
opaque origin. The zone must keep Rocket Loader off and every HTML-rewriting feature off
(email obfuscation, HTML minification, script injection), because each rewrites the script
tags the static export and the sandbox depend on. Phase 1 re-runs the probe through the
proxy against the deployed site (section 18.1), and the post-deploy smoke job fails when
served HTML contains `/cdn-cgi/` (section 17.3).

### 11.5 The message protocol

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
      stack?: string;
      errors?: SerializedError[]; // BlueprintError.errors
      cause?: SerializedError; // ProviderError.cause
    }
  | { type: 'heartbeat' }
  | { type: 'done'; durationMs: number }
);
```

`TraceEvent` and `NexusGraph` are core's own types (core spec §10). `SerializedValue`
renders a value for the console log: primitives as they are, a class instance as its class
name and own enumerable fields to depth 3, a function or class as `[class QuantumComputer]`,
a `NexusError` with its `code`. The harness serializes before posting, so the message
structured-clones. A `NexusError` travels with its `path` field and, for a
`BlueprintError`, every entry of `errors`. For a `ProviderError` the harness also
serializes `cause`, so a view can show the error that caused `NEXUS_PROVIDER_FAILED`
(section 12.3).

The parent maps stack frames itself. A frame in a `data:` module carries the whole data
URL, and no browser applies a source map to `Error.stack`. So the parent parses each
frame, matches the data URL to the reader's file that produced it, and then applies that
file's source map from the worker to reach the editor line.

The parent accepts a message only when `event.source` is the current run's
`contentWindow`, `v` is 1, `runId` matches, and a hand-written type guard accepts the
shape. It drops anything else. It renders every string as text. It caps a run at 1,000
console entries and 256 kB of serialized payload, then drops further messages and shows
that it did.

### 11.6 The kill switch

The review measured a 3-second synchronous loop in the sandboxed frame. It froze the
parent page in Firefox, in WebKit and in headless Chromium. Only headed Chromium ran the
frame in its own process. A Worker inside the frame is no way out: import maps do not
apply in workers, Chromium refuses a module `blob:` worker from an opaque origin, and
Firefox needs a `worker-src` the CSP would have to open. So the frame stays, and three
layers end a run.

1. The loop guard is the primary defence. The worker's transformer inserts `__guard()` at
   the top of every loop body and every function body. `__guard` compares
   `performance.now()` with the start of the current macrotask turn, and throws a
   `RunawayError` when one turn has run for more than 1,000 ms. The harness resets the
   turn start from a `setTimeout(0)` heartbeat, so a chain of microtasks that never
   yields also trips it. The guard is sticky: once tripped, every later `__guard()` call
   throws, until the frame is removed. A `catch` in the reader's code cannot swallow the
   error and loop again. The error reaches the parent as
   `{ type: 'error', phase: 'loop' }` with the editor line.
2. The wall clock. A run that sends no `done` within 10 seconds (the Academy uses 5
   seconds per objective) ends: the controller removes the iframe and reports
   `phase: 'timeout'`.
3. The watchdog. The harness posts a heartbeat every 250 ms. When the parent sees no
   heartbeat for 2 seconds, it removes the iframe.

Layers 2 and 3 end asynchronous non-termination in every engine. They end a synchronous
loop only in a browser that runs the frame on its own thread, which today is headed
Chromium, because elsewhere the parent's timers cannot fire while the frame's loop runs.

The guard cannot see a single built-in call that runs long without returning to guarded
code: `'x'.repeat(2 ** 28)`, catastrophic regular-expression backtracking, or a fill or
sort over a very large array. In Firefox, WebKit and headless Chromium such a call freezes
the page until it finishes or the engine throws. The Playground states this in its help
text. No seed the site builds does any of these.

When the controller removes the iframe, the browser ends everything the run started. The
next run builds a new frame, so no state carries between runs.

### 11.7 Load budget and caching

| Asset                        | Gzipped | Loads when                               |
| ---------------------------- | ------- | ---------------------------------------- |
| Console island               | 35 kB   | the page hydrates                        |
| CodeMirror 6 and its TS mode | 150 kB  | the reader opens an editor               |
| TypeScript worker            | 1.05 MB | the first edit, or Run on an edited file |
| Declarations JSON            | 107 kB  | with the worker                          |
| Core runtime copy            | 30 kB   | the first Run                            |
| valibot runtime copy         | 15 kB   | the first Run that imports `valibot`     |

The published `typescript.js` gzips to 1.65 MB, and to 1.03 MB once minified, as the
review measured. The worker chunk is minified, so the row reads 1.05 MB with
`@typescript/vfs`. `playground-types.mjs` emits every seed's JavaScript at build time, so
Run works on an unedited seed before the worker arrives.

Every runtime asset has a content hash in its URL, so a deploy that changes an asset
changes its URL and a deploy that changes nothing leaves every URL as it was. Through
Cloudflare the site answers with `Cache-Control: max-age=600` and an `ETag`. Within ten
minutes the browser reuses the cached worker with no request. After that it sends a
conditional request, and the answer is `304 Not Modified` without the body. The runtime
adds no service worker and no Cache Storage layer.

### 11.8 The editor

CodeMirror 6 with `@codemirror/lang-javascript` in TypeScript mode, `@codemirror/lint` for
the diagnostics, and a tab strip when a seed has more than one file. `Tab` indents inside
the editor, and `Escape` followed by `Tab` moves focus out, which the editor's accessible
label states. The Playground offers Run, Reset to seed, and a file tab per module. The
console and the Academy use the same editor component with fewer controls.

### 11.9 Seeds

A seed is a named, runnable program: one or more files and the entry file. The registry is
`apps/docs/components/runtime/seeds.ts`, which maps a seed id such as
`scopes/two-shuttles` to `{ files: [{ path, file, region }], entry }`. Every file comes
from a doctested region in `examples/meridian` or `libs/core/README.md` through the region
parser, so the editor starts on code a test ran.

`tools/repo-checks/src/doc-seeds.test.ts` asserts each seed: every region exists, every
file the region comes from sits in a Vitest project's include set, the files type-check
with `compiler-options.ts`, and the seed runs in Node against the workspace core and
produces the fixture `console-fixtures.mjs` wrote. A `ConsoleView`, a Playground link or
an Academy mission that names an unknown seed fails the same test.

The Playground reads `?seed=<id>` on the client. A link carries a seed id and no code
string, so no link can make another reader's browser run code the site did not build and
test (the libraries interactive-examples spec §6).

### 11.10 Security model

- The reader's code runs only in a sandboxed iframe with an opaque origin and a CSP that
  forbids network requests. It cannot reach the docs origin's DOM or any of its storage.
- The worker runs TypeScript, which parses and checks code and never executes it.
- The parent validates every message and renders every value as text.
- A seed id names code the site built and tested. The site has no share-by-code link.
- nexus.js.org sets no cookies and stores only the theme and background preferences in
  `localStorage` and the Academy progress in IndexedDB, and the frame can reach neither.
- The worst a reader can do is freeze their own tab: the loop guard ends a loop, and the
  residual cases of section 11.6 end when the call finishes.

## 12. Graph and trace views

Both views render core's own data: `NexusGraph` from `ship.graph()` and `TraceEvent`s from
the `trace` callback (core spec §10). They live in `apps/docs/components/graph/` as React
components over pure layout and replay functions that the unit tests call directly. Core
is unchanged by them.

### 12.1 The graph view

The layout is layered, by the docs' own rule. Providers are nodes and edges are
dependencies.

1. Layers. A provider's layer is the length of the longest path from it to a provider with
   no dependencies, over every edge kind except `lazy`. Layer 0 is at the bottom and
   consumers sit above their dependencies.
2. Order within a layer. Four barycenter sweeps reduce crossings, and ties break by
   provider id, so the same graph always draws the same way.
3. Edges. `lazy` edges route as curves outside the layer order, drawn dotted with an open
   arrowhead, so a cycle broken by `lazy()` reads as a loop with one soft link.

Each node is a thin-bordered rectangle holding the token's display name, the module name
beneath it, and a lifetime glyph with a text label: `singleton`, `scoped`, `transient`, or
`value` and `alias` for a provider with no lifetime. The glyph and the border take the
lifetime colour (section 8.2), and the text label carries the same fact. A factory node
whose `async` is `true` carries a small clock mark.

| Edge kind  | Stroke                                            |
| ---------- | ------------------------------------------------- |
| `required` | solid, filled arrowhead                           |
| `optional` | dashed, filled arrowhead                          |
| `lazy`     | dotted, open arrowhead, routed outside the layers |
| `all`      | double line, a count badge at the target          |
| `alias`    | thin solid with an `=` marker at the midpoint     |

A module filter chip row above the graph dims the providers outside the chosen modules.

The SVG carries `role="img"` and an `aria-labelledby` pointing at the view's caption. A
`<details>` under it holds the same graph as two tables, providers and edges, rendered on
the server. Pan and zoom use the SVG `viewBox`, driven by drag, the wheel, and the
keyboard (`+`, `-`, the arrow keys, `0` to reset). A Meridian graph has about 15 nodes.
The layout targets 60 nodes before it needs clustering, which is out of scope (section 19).

### 12.2 Trace replay

The replay steps through a recorded list of events on top of a graph view.

- `construct` lights its provider's node, in the scope lane named by `scope` when the value
  is a scope id.
- `init` marks the node ready.
- `scope:create` opens a lane labelled with the scope id. `scope:dispose` closes it.
- `dispose:instance` dims the node it names, in the scope lane it names, one event per
  disposed object in the order core disposed them (core spec §8.2). The replay reads the
  order from the events and computes nothing.
- `dispose` ends the replay with the disposed and error counts.
- `untracked` marks the transient with a `Warning` label and says in words that nothing
  disposes it.
- `compile` shows the provider and module counts and any error count.

The controls are previous, play or pause, next, a scrubber and a speed switch (0.5×, 1×,
2×). At 1× a step takes 600 ms. The replay uses a fixed step because a recorded
`durationMs` measures the machine that ran it and says nothing about the concept. The live
run shows the real durations in the event list. An `aria-live="polite"` region announces
each step as a sentence ("ShipComputer constructed in scope s0"). Under reduced motion the
replay opens paused on the final state, and each step changes the highlight with no
animation.

### 12.3 The error view

A failed `create` or `load` has no graph to draw, so the console shows the error view:

- Every entry of the `BlueprintError`'s `errors` array, in order, each with its code, its
  message and a link to its anchor on `/api-errors/`.
- For each entry with a `path` (a cycle, a lifetime violation, a module import cycle), the
  path drawn as a ring of named nodes, closing on the first name.

A `ProviderError` (`NEXUS_PROVIDER_FAILED`) shows its `cause` first, unwrapped: an invalid
module option arrives as `NEXUS_PROVIDER_FAILED` with `NEXUS_INVALID_MODULE_OPTIONS` as its
cause, and the reader needs the cause's code and the schema's issues. The outer code shows
beneath it. The Academy's failure messages unwrap `cause` the same way (section 13.5).

### 12.4 Mermaid

Prose diagrams stay `mermaid` fences under the libraries diagrams spec: a required
`caption`, one `:::accent` node, the colours replaced by `var(--meridian-*)` properties
through the sentinel mechanism, and a lazy import of Mermaid inside an
`IntersectionObserver`. A Mermaid diagram draws a flow the prose describes, such as the six
compile passes or the disposal order. The graph view owns every picture of a `graph()`
result.

## 13. Academy

The Academy at `/academy/` is a sequence of missions that build the Starship Meridian, one
concept each. The reader writes the ship's code in the editor and runs the checks, and the
ship's code carries forward into the next mission.

### 13.1 Missions

Each mission follows the concept page it practises, in the same order. Missions 1 to 3 use
guided cards (layout C) while the reader learns the Academy's controls. Missions 4 to 9
use the briefing strip (layout B). Every mission stays unlocked.

| #   | Id                     | Title             | Practises              | Objectives                                                                                                                                                                                               | A failure message                                                                          | Layout |
| --- | ---------------------- | ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| 1   | `01-first-light`       | First light       | Tokens and interfaces  | `REACTOR` is a `Token<IReactorCore>` bound to `FusionReactor`; `QuantumComputer` takes `IReactorCore` through `deps: [REACTOR]`; a test override puts `FakeReactor` under an unchanged `QuantumComputer` | "QuantumComputer asked for FusionReactor by name, so no other reactor can take its place." | C      |
| 2   | `02-chart-room`        | Chart room        | Providers              | `NAV_CHARTS` comes from an async factory over `SUBSPACE_LINK`; the factory runs once, during `create`                                                                                                    | "NavCharts was built from a value, and the charts never downloaded."                       | C      |
| 3   | `03-drone-bay`         | Drone bay         | Lifetimes              | two `get(DRONE)` calls launch two drones; both drones share one `COMPUTER`                                                                                                                               | "Both launches returned the same SurveyDrone."                                             | C      |
| 4   | `04-decks`             | Decks             | Modules                | `Engineering` exports `COMPUTER`; `POWER_ROUTER` stays private; `Tactical` resolves `COMPUTER`; `SimulatorEngineering` swaps in with no change to `Tactical`                                             | "Tactical asked for ShipComputer, and Engineering keeps it private."                       | B      |
| 5   | `05-open-channel`      | Open channel      | Configurable modules   | `Comms.with({ frequency: 1420, transport: 'laser' })` binds `SUBSPACE_LINK` to a `LaserLink`; the schema rejects a negative frequency                                                                    | "Comms accepted frequency -3."                                                             | B      |
| 6   | `06-shuttle-launch`    | Shuttle launch    | Scopes and REQUEST     | each shuttle reads its own `MISSION`; each shuttle keeps one `FLIGHT_LOG` of its own; no singleton holds a `MISSION`                                                                                     | "FlightLog was built once for two shuttles."                                               | B      |
| 7   | `07-scram-drill`       | Scram drill       | Lifecycle and disposal | `QuantumComputer.onInit` finishes its self-test before `create` resolves; the trace shows the reactor disposed once, after the computer, with `FusionReactor` and with `FakeReactor` overridden in       | "The reactor scrammed before the computer shut down."                                      | B      |
| 8   | `08-power-loop`        | Power loop        | Lazy edges and cycles  | the ship starts with `SHIELDS` and `POWER_ROUTER` both bound; `divert()` on the router reaches the grid                                                                                                  | "ShieldGrid and PowerRouter each waited for the other."                                    | B      |
| 9   | `09-diagnostics-sweep` | Diagnostics sweep | Multi-providers        | `Engineering` and `Tactical` each contribute a diagnostic; `Tactical` exports `DIAGNOSTICS`; `DIAGNOSTICS_PANEL` in `Meridian` receives both                                                             | "DiagnosticsPanel saw one diagnostic of two."                                              | B      |

Every mission's seed and solution follow the interface-first rule (section 7.3). Mission 1
starts from a seed that breaks it on purpose: `QuantumComputer` takes a `FusionReactor`
directly, so the test override of its third objective cannot work until the reader
introduces the interface and the token. Mission 7 reads the order of `dispose:instance`
events from the run's trace (core spec §8.2). Mission 9 teaches multi-token visibility: a contribution crosses a module boundary
only through an export.

The Errors and Introspection pages have no mission. Every mission shows both: a failed
check shows the `NexusError` code the run produced, and the console shows the graph and the
trace of every run. A later mission set can add them (section 19).

### 13.2 A mission's files

Each mission is a directory `apps/docs/academy/<id>/` with two files.

`briefing.mdx` is the text: the mission's goal in one paragraph, the concept it practises
with a link to the concept page, and one short paragraph per objective naming the exports
its check reads. The prose guards apply to it, and the reviewer agent reads it. The Academy
route renders it inside the mission layout, so it is no Nextra content page, and the floor
and control guards skip it.

`mission.ts` is the data:

```ts
import type { Mission } from '../mission-types';

export default {
  id: '06-shuttle-launch',
  version: 1,
  title: 'Shuttle launch',
  practises: 'scopes',
  layout: 'briefing',
  carries: ['engineering.ts', 'comms.ts'],
  replaces: ['tactical.ts'],
  seed: { files: [...], entry: 'main.ts' },
  seedDiagnostics: [],
  solution: { files: [...], entry: 'main.ts' },
  reads: ['ship', 'FLIGHT_LOG', 'MISSION'],
  objectives: [
    {
      id: 'flight-log-per-shuttle',
      title: 'Each shuttle keeps one FlightLog of its own',
      teaches: true,
      guided: false,
      check: async ({ ship, exports: { FLIGHT_LOG } }) => {
        await using a = await ship.createScope({
          request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
        });
        await using b = await ship.createScope({
          request: { mission: { id: 'survey-8', target: 'Gliese-667Cc' } },
        });
        if (a.get(FLIGHT_LOG) !== a.get(FLIGHT_LOG))
          return { status: 'fail', message: 'One shuttle got two FlightLogs.' };
        if (a.get(FLIGHT_LOG) === b.get(FLIGHT_LOG))
          return { status: 'fail', message: 'FlightLog was built once for two shuttles.' };
        return { status: 'pass' };
      },
      decoys: [
        { name: 'ShuttleFlightLog bound as a singleton', files: [...] },
        { name: 'ShuttleFlightLog bound as a transient', files: [...] },
      ],
    },
  ],
  hints: [
    {
      id: 'lifetime',
      objectiveId: 'flight-log-per-shuttle',
      text: 'A provider that belongs to one shuttle takes a lifetime of its own.',
    },
  ],
} satisfies Mission;
```

`seed`, `solution` and each decoy list files by region, for example
`{ path: 'tactical.ts', file: 'examples/meridian/src/academy/06-shuttle-launch/seed/tactical.ts', region: 'tactical' }`,
so every editor seed comes from a region in a tested project. `version` rises when an
objective changes, and the progress store keys every event by it (section 13.6).

- `carries` lists the files that come unchanged from mission N−1's solution, or from the
  reader's own passing code (section 13.4).
- `replaces` lists the files mission N supplies over the carried ones.
- `seedDiagnostics` lists the TypeScript error codes the seed produces on purpose. Mission
  1 lists the one its first objective teaches the reader to fix.
- `reads` lists every export a check reads, and the precheck in section 13.4 uses it.
- `decoys` are known-wrong solutions per objective. The mission guard requires each one to
  fail that objective (section 14.4), so a check that passes a wrong answer fails CI.

A `check` receives `ship`, the container the reader's `main.ts` exports
(`export const ship = await Nexus.create(Meridian)`); `exports`, the reader's other
exports from every file; `trace`, every `TraceEvent` of the run so far, in order; and
`core`, which holds `@nexusdi/core` and `@nexusdi/core/testing`. After the last check the
harness disposes `ship`.

The objectives are "hidden" in the sense that the interface shows their titles and results
and hides their code. The site is static, so a reader who opens the built JavaScript can
read them. The Academy states this on its index page.

### 13.3 Layouts

Both layouts are widget items (section 10.4) with a `meta` vocabulary of
`{ area: 'strip' | 'editor' | 'console' | 'overlay' | 'actions' }`, so a mode change is a
change of items and `meta`, animated by a view transition (section 10.5).

Layout B, the default: a briefing strip across the top holds the mission title, one
paragraph and the objective list with a status marker per objective. The strip collapses to
one line. The editor fills the left and the shared console (section 10) fills the right,
showing the graph and trace of the last run, or the error view. The action row holds Run
checks, Hint, Reset and the stats.

Layout C, the guided mode: one card over the editor shows one objective at a time, with the
step's instruction and a Check button. The card moves to the next objective when the check
passes. Missions 1 to 3 run entirely in layout C. A later mission marks a single objective
`guided: true` to show a card for one difficult step inside layout B.

### 13.4 Carrying the ship forward

Mission N's seed is mission N−1's reference solution for the files in `carries`, plus the
files in `replaces` and any new files. When the reader passed mission N−1 in this
browser, the mission offers two starts: "Continue with your ship", which loads the reader's
last passing code for the `carries` files, or "Start from the reference ship". Before the
reader starts, the mission shows each `replaces` file as a diff against the reader's
version, so nothing the reader wrote disappears unseen. A precheck then compiles the
carried code, lists any name in `reads` that the code does not export, and offers the
reference ship. A reader who opens mission N first gets the reference ship.

### 13.5 Runtime

The Academy runs on the shared runtime (section 11). `apps/docs/tools/academy-runtime.mjs`
compiles each `mission.ts` into `public/academy-runtime/<id>-<hash>.js`, and the import map
of an Academy run adds `@academy/checks` for it. When the import map carries that entry,
`boot.js` imports the reader's `main.ts` and then runs each objective's `check` in
declaration order, each under the 5-second limit, posting a `test` message per objective.
A check that throws posts `fail` with the thrown error's code and message. For a
`ProviderError` it posts the `cause`'s code and message, with the outer code beneath
(section 12.3).

### 13.6 Progress schema

Progress lives in IndexedDB, database `nexusdi-academy`, behind
`apps/docs/components/academy/store.ts`: about 150 lines that wrap `IDBRequest` and
`IDBTransaction` in promises, with no dependency. The stores hold raw events and the
reader's code. Every figure the Academy shows is derived from them when it renders.

| Store              | Key                        | Indexes                                    | Record                                                                                                                          |
| ------------------ | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `meta`             | `key`                      | none                                       | `{ key: 'schema', version: 1, createdAt }`                                                                                      |
| `missions`         | `missionId`                | none                                       | `{ missionId, firstOpenedAt, lastCode: Record<path, string>, lastCodeHash, passedCode?: Record<path, string>, passedVersion? }` |
| `attempts`         | `attemptId` (a UUID)       | `missionId`, `[missionId, missionVersion]` | `{ attemptId, missionId, missionVersion, codeHash, startedAt, durationMs, outcome: 'pass' \| 'fail' \| 'error' \| 'timeout' }`  |
| `objectiveResults` | `[attemptId, objectiveId]` | `[missionId, missionVersion, objectiveId]` | `{ attemptId, missionId, missionVersion, objectiveId, status: 'pass' \| 'fail', code? }`                                        |
| `hintEvents`       | auto-increment             | `[missionId, missionVersion]`              | `{ missionId, missionVersion, hintId, objectiveId?, shownAt }`                                                                  |

`codeHash` is the SHA-256 of the files, joined in path order, from `crypto.subtle`.
`durationMs` counts the time since the previous attempt, or since the mission opened,
while the tab was visible. `objectiveResults` holds one record per objective per attempt,
so it is an event log keyed by the attempt and indexed by mission version.

rc.0 shows, per mission and for the current mission version, a pass or fail marker per
objective and three figures: attempts, time spent and hints used. It shows no ranking and no
score. The first pass time, the attempts before a pass and the hints before a pass are
computed from the three event stores.

Stars and ship-upgrade badges are derived the same way. A later release computes three stars
per mission from `objectiveResults` and `hintEvents` (a hint or a failed check before the
pass lowers the count) and awards a cosmetic badge from the set of passed missions. Neither
needs a stored field.

Schema versions follow one rule: an upgrade adds a store or an index and never rewrites a
record. `onupgradeneeded` runs a list of additive steps keyed by version. The `meta` record
holds the version. Every open connection sets `onversionchange = () => db.close()`, so an
upgrade in another tab never waits on this one, and an `open` that fires `onblocked` shows
"Close the other Academy tabs to finish updating." A test opens a version 1 database with a
later schema and asserts every record reads back unchanged.

### 13.7 Progress page, storage and export

`/academy/progress/` is a dashboard of widget items (section 10.4): one card per mission
with its status and figures, placed on a grid through `meta`, and the next-mission
recommendation. The recommendation is a client component that reads the stores and
picks the first mission after the reader's newest pass that has no pass at the current
version, or mission 1.

Storage: the Academy calls `navigator.storage.persist()` when a reader first runs a check,
and the progress page shows the result of `navigator.storage.persisted()` in words. The page
states on every visit that progress lives only in this browser, and points at Export.
Without persistent storage a browser may evict the data: Safari deletes script-written
storage for a site the reader has not visited in seven days, and every browser evicts under
storage pressure. Private browsing modes open IndexedDB and discard it when the window
closes.

The page offers two actions:

- Export downloads a JSON file, `nexusdi-academy-progress.json`, with
  `{ format: 'nexusdi-academy-export', version: 1, exportedAt, stores: { … } }` holding
  every record of every store, through a `Blob` and an object URL.
- Reset asks for confirmation in a native `<dialog>`, then deletes the database and reloads
  the page.

When `indexedDB.open` throws or fails, the Academy shows a notice on every mission:
"This browser is not saving Academy progress. Missions still run, and your code stays until
you leave the page." The missions keep their state in memory for the session.

### 13.8 Nothing leaves the browser

The Academy makes no network request apart from loading the site's own assets. It has no
analytics and no account, so no server ever holds a reader's progress. The export file is
the only way progress leaves the browser, and the reader starts it. An end-to-end test
asserts that a full mission run requests nothing outside the site's origin (section 17).

## 14. Docs tooling

### 14.1 `tools/doc-examples`

The package is copied from the libraries repo's `tools/doc-examples` at a pinned commit
(`f3f266d` or the newer commit current when Phase 1 starts), and the commit that adds it
names that libraries commit. From then on this repository owns it. The copy is the whole
`src/` directory: `regions.mjs`, `mdx-region-loader.mjs`, `mdx-reference-loader.mjs`,
`declarations.mjs`, `preamble.mjs`, `md-siblings.mjs`, `expect-comments.ts`,
`vite-plugin.ts`, `vite-config.ts` and `index.ts`, with their `.d.mts` files and tests.

Four changes:

1. The package name becomes `@nexusdi/doc-examples`, private, under the same subpath
   exports.
2. `vite-config.ts` and `declarations.mjs` resolve through `@nexusdi/source`, where the
   original resolves through `@evanion/source`.
3. `mdx-reference-loader.mjs` takes a `classPrefix` option and emits
   `${classPrefix}-api-entry`, `${classPrefix}-api-entry__signature`,
   `${classPrefix}-api-entry__more` and `${classPrefix}-kind-<kind>`. The docs app passes
   `classPrefix: 'nexus'`. The option has no default, so a caller that forgets it fails at
   load time.
4. The doc comments that name `@evanion/*` packages as examples are rewritten to name
   `@nexusdi/core`.

`libs/core` and `examples/meridian` wire `docExamples()` into their Vitest configs, so
their README and source regions run as tests and `// -> value` claims become assertions.

### 14.2 Loaders and build steps

`apps/docs/next.config.ts` registers the loader chain under `turbopack.rules['*.mdx']`, in
the libraries order, which Turbopack runs in reverse:

1. `@nexusdi/doc-examples/mdx-reference-loader` with `{ root, classPrefix: 'nexus' }`
2. `@nexusdi/doc-examples/mdx-region-loader` with `{ root }`
3. `apps/docs/tools/mdx-twoslash-prelude.mjs`, new
4. `apps/docs/tools/mdx-diagram-loader.mjs`, copied, with the Meridian palette
5. `apps/docs/tools/mdx-listing-loader.mjs`, copied unchanged

Nextra 4.6.1 builds its twoslash transformer with fixed options and no way to pass compiler
options (`DEFAULT_TRANSFORMERS` in `nextra/dist/server/loader.js`). So the prelude loader
runs after the reference and region loaders have written their fences, and prepends to
every `twoslash` fence, behind `// ---cut---`, the compiler options from
`compiler-options.ts` as twoslash `// @option: value` lines and `runtime-globals.d.ts` as a
`// @filename:` block. A twoslash fence on a page and a seed in the Playground then compile
in one environment. `doc-twoslash.test.ts` compiles with the same prelude.

The config also sets `output: 'export'`, `images: { unoptimized: true }`,
`trailingSlash: true`, `basePath: process.env.DOCS_BASE_PATH ?? ''` (section 15.4) and
Nextra's `search: { codeblocks: false }`.

The docs app's Nx targets run the generated inputs before `next build`, each cached on its
inputs:

| Target                  | Script                       | Writes                                                                                                                                       |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs:runtime-assets`   | `tools/runtime-assets.mjs`   | `public/runtime/core-<hash>/` from `libs/core/dist`, plus `harness.js`, `harness-testing.js`, `boot.js`, and `public/runtime/valibot-1.5.0/` |
| `docs:playground-types` | `tools/playground-types.mjs` | `public/runtime/types-<hash>.json` and each seed's emitted JavaScript                                                                        |
| `docs:console-fixtures` | `tools/console-fixtures.mjs` | `components/console/fixtures/<seed>.json`                                                                                                    |
| `docs:academy-runtime`  | `tools/academy-runtime.mjs`  | `public/academy-runtime/<id>-<hash>.js`                                                                                                      |
| `docs:behaviour-data`   | `tools/behaviour-data.mjs`   | the per-export behaviour JSON the reference loader reads                                                                                     |
| `docs:package-facts`    | `tools/package-facts.mjs`    | the landing page's dependency count                                                                                                          |
| `docs:benchmark-data`   | `tools/benchmark-data.mjs`   | `generated/benchmark-data.json`, validated from `benchmarks/results/` (section 4.6)                                                          |

Every generated path is gitignored. `docs:build` depends on `^build` and on all seven.

`postbuild` runs three steps over `out/`, in this order: `tools/md-siblings.mjs` writes the
`.md` sibling of every page after region and reference expansion, `tools/blog-feed.mjs`
writes the blog feeds when the build includes the blog, and Pagefind indexes the HTML into
`out/_pagefind`. The docs workflow runs `postbuild` as its own step, because Nx calls
`next build` directly and npm's lifecycle never fires (the libraries `docs.yml` records the
same).

### 14.3 Guards

Each guard lives in `tools/repo-checks/src` and follows the libraries shape: read the
content tree, hold it against something derived, fail with a message naming the file and
the fix. Phase 1 adds the guards before most pages exist. G2, G4, G10 and G11 each record
the roles, pages and exports Phase 1 has not written in an allowance file, and every entry
leaves as its page or test arrives. The ratchet files of G3, G9 and G10 are ported with the
libraries' slack and hygiene tests: a count that falls must be lowered in the file, and an
entry no longer needed fails. By rc.0 every allowance is empty except G8's, which lists the
pages whose length the reviewer accepted.

| Guard                     | Libraries source                      | Rule here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 `doc-navigation`       | `docs-navigation`, G1 half            | Every page under `content/` is a `_meta.ts` key and every key is a page. Every page has exactly one `# ` heading and a valid `kind`. `requires` names the one or two pages immediately before it in `_meta.ts`, of a teaching kind.                                                                                                                                                                                                                                                                                                                                           |
| G2 `doc-floor`            | `doc-floor`                           | `index` (`overview`), `getting-started` (`tutorial`) and `api` (`reference`) exist, and every slug in `navigation.ts`'s named concept list exists with `kind: concept`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| G3 `doc-fence`            | `doc-fence`                           | Every fence is `file=… region=…`, `twoslash`, a shell language, `mermaid`, or carries one of the five tags. Per page, `no-run` and `anti-example` together never outnumber the executed fences. `post` pages are skipped.                                                                                                                                                                                                                                                                                                                                                     |
| G4 `doc-control`          | `doc-control`                         | `getting-started` mounts a `ConsoleView`. Every H2 section of a `concept` page mounts one `ConsoleView` or one `ConsoleExempt` with a non-empty `reason`. Every `ConsoleView` has a non-empty `caption`.                                                                                                                                                                                                                                                                                                                                                                      |
| G5 `doc-exports`          | `doc-exports`                         | Every `import … from '@nexusdi/…'` in a fence resolves through the package's `exports` map under `@nexusdi/source`, and every bound name is exported there. A `signature` fence's `##` heading names an export. An `@nexusdi/…` reference in a `mermaid` fence names an export. Pre-0.4.0 posts are skipped.                                                                                                                                                                                                                                                                  |
| G6 `doc-specimen`         | `doc-specimen`                        | Every operable component under `components/specimens/` is registered in `mdx-components` and mounted on a content page besides `index`. No component name is hard-coded.                                                                                                                                                                                                                                                                                                                                                                                                      |
| G7 `doc-links`            | `doc-links`                           | Every root-relative link names a content page or an app route, the dynamic `/academy/[mission]/` included, checked against the mission list. A link that hard-codes `/next/` fails, because Next adds the base path. A link to a NexusDI README on GitHub fails, because the site documents what the README covers.                                                                                                                                                                                                                                                           |
| G8 `doc-prose-budget`     | `doc-prose-budget`                    | 1,200 words of prose a page, reported and not failed. Pages whose slug starts with `api` are exempt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G9 `doc-domain`           | `doc-domain`                          | No fence, after region expansion, names a noun from section 7.7. Pages with `domainExempt` in frontmatter and pre-0.4.0 posts are skipped. Ratchet file ported.                                                                                                                                                                                                                                                                                                                                                                                                               |
| G10 `doc-export-coverage` | `doc-export-coverage`                 | Every export of `.`, `./node` and `./testing` has a `##` heading on an `api*` page, and every callable one appears in an executable fence. Every `NexusErrorCode` member has an `###` on `api-errors`. Every code in `@nexusdi/codemod`'s `TODO_CODES` and `NOTE_CODES` has an `##` on `codemod`, read from the lists themselves. Phase 1 allowance and ratchet file.                                                                                                                                                                                                         |
| G11 `doc-behaviour`       | `doc-behaviour`                       | Every non-error callable export has a `describe` naming it in `libs/core`'s tests. Phase 1 allowance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `doc-refused-words`       | `doc-refused-words`                   | The libraries list, plus the em dash and the en dash in prose. Pre-0.4.0 posts are skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `doc-antithesis`          | `doc-antithesis`                      | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `doc-figures`             | `doc-figures`                         | The libraries list, plus `lands`, `bites`, `earns` and `pays` in prose, which have no literal use on this site.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `doc-notices`             | new                                   | Notice labels are `Note`, `Exception`, `Warning` and `Ship note`. At most two a page, and no two adjacent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `doc-interface-first`     | new                                   | In every fence and region outside the Migration band and pre-0.4.0 posts, and in every seed and mission file: the first argument of `provide()`, the `token` of an object-literal provider, and every entry of `deps`, `static deps` and `@Injectable` deps is a SCREAMING_CASE token or a modifier over one; `useClass` names a class. In `examples/meridian`, a test builds each seed and page program and asserts that each concrete class appears in exactly one provider and that every constructor parameter of a bound class is typed with an interface (section 7.3). |
| `doc-benchmark-figures`   | new, from benchmarks spec §9, widened | On every content page except pre-0.4.0 posts, no prose and no table cell outside a component states a number followed by a size or time unit (`B`, `bytes`, `kB`, `KB`, `MB`, `ns`, `µs`, `ms`, `s`) or a `%`. Every `<Figure of>` path and every `run` names data that exists.                                                                                                                                                                                                                                                                                               |
| `doc-twoslash`            | `doc-twoslash`, adapted               | Every `twoslash` fence compiles with the prelude of section 14.2, and every declared `@errors` code is still produced.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `doc-regions`             | `doc-regions`, adapted                | Every cited file and region exists, in `libs/core/README.md`, `examples/meridian` or the codemod fixtures, seed and mission regions included.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `doc-md-siblings`         | `doc-md-siblings`, adapted            | Every `.md` sibling carries each cited region's code and each reference entry's expansion, posts included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `diagram-captions`        | `diagram-captions`                    | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `doc-reference`           | `doc-reference`, adapted              | The reference loader against `@nexusdi/core`'s built declarations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs-trigger`            | `docs-trigger`, adapted               | `docs.yml`'s path filter covers `libs/**`, `internal/**`, `examples/meridian/**` and `tools/doc-examples/**`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `doc-commitments`         | new                                   | Every heading in `apps/docs/commitments.json` exists on its page (section 4.5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `doc-seeds`               | new                                   | Section 11.9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `academy-missions`        | new                                   | Section 14.4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs-deploy`             | new, replaces `docs-archive`          | `apps/docs/deploy.json` matches its schema, and the `/v0.3/` retention check of section 15.7. The libraries `docs-archive` guard checks archives for superseded majors; this site keeps one archive and no other before 1.0, so the retention check takes its place.                                                                                                                                                                                                                                                                                                          |

Two libraries tools are not ported: the `/testing` statistics section and its
`testing-data` target (`apps/docs/tools/test-statistics.mjs`). The behaviour lists on the
API reference (G11) cover what a reader looks up about the tests, and a statistics section
can follow once the engine's suite exists.

The rules no guard reaches stay the reviewer's (standard §12): the teaching order and its
fading, whether a teaching layer stands alone, whether an H2 section stands alone when cut
out, whether a diagram or a console caption is still true, whether a control teaches, and
whether an example is set on the Meridian.

### 14.4 The mission guard

`tools/repo-checks/src/academy-missions.test.ts` runs every mission in Node against
`libs/core/dist`, the build the browser runtime copies:

1. The solution type-checks with `compiler-options.ts` with no diagnostics. The seed
   produces exactly the diagnostics in `seedDiagnostics`, in both directions, the way
   `doc-twoslash` treats `@errors`.
2. The guard transpiles the seed with the worker's transformer, loads it as a fresh module
   graph, and runs every check with the run's trace. Every objective marked
   `teaches: true` fails, and every failure carries a non-empty message.
3. It does the same with the solution. Every objective passes.
4. It does the same with each decoy. The decoy's objective fails.
5. Each check finishes inside the 5-second limit the browser applies.
6. For N > 1, every file in mission N's `carries` equals the same file in mission N−1's
   solution. Files in `replaces` are exempt from this step.
7. Every name in `reads` is exported by the solution.

The Playwright suite runs missions 1 and 6 in the real sandbox (section 17), which covers
the browser half of the same contract.

### 14.5 The libraries pin

The ported agent, skill and guards follow the libraries documents at one commit.
`apps/docs/libraries-pin.json` records that commit's SHA and the path of each document the
site follows. The agent and the skill fetch each document from
`https://raw.githubusercontent.com/Evanion/libraries/<sha>/<path>` at that SHA. A
bump is a pull request that changes the SHA and carries the diff of every pinned document
since the old one, so a reviewer sees what the standard changed before this site adopts it.

### 14.6 The reviewer agent

`.claude/agents/docs-reviewer.md` is the libraries agent, ported at the pinned commit, with
these changes:

- It reads `apps/docs` and `apps/docs/academy`, and checks claims against `libs/core/src`
  and core spec §§3 to 11.
- The domain rule names the Meridian and section 7, and the notice rule names `Ship note`.
- A region's source is in `examples/meridian`, `libs/core/README.md` or a codemod fixture,
  and the agent reads the region, since the fence is empty in the MDX.
- Five new checks: a `ConsoleView` caption states in words what its view shows; no
  sentence sends the reader to the console for a meaning the prose leaves out; a mission
  briefing names every export its checks read; a claim about another library on
  `/comparison/` cites its source and version; every example follows the interface-first
  rule of section 7.3, including the parts `doc-interface-first` cannot see, such as a
  concrete class reached through a factory.
- It reads the pinned libraries documents (section 14.5) and this spec's amendments
  (section 3).

The agent reports findings and edits nothing, as the libraries agent does.

### 14.7 The skill

`.claude/skills/docs-page/SKILL.md` is the libraries skill, ported at the pinned commit,
with NexusDI's verification and traps. It names the pinned documents and this spec.
Verification is the CI command, `npx nx run-many -t lint test build typecheck`, then
`npx nx e2e docs-e2e` for a page that mounts the runtime, then `npx prettier --check .`.
The traps list keeps every libraries trap (a stale `.next`, the Nx cache shared across
worktrees, a stale `dist` behind twoslash and the reference loader, the shared stash, empty
region fences, `twoslash` as the only extra meta word, `^?` on the last line, the upstream
`.twoslash-query-presisted` spelling, one-directional `@errors`, the mermaid caption) and
adds four:

- A link written as `/next/…` breaks at the swap. Write root-relative links; Next adds the
  base path.
- Console fixtures and seed JavaScript are built from `libs/core/dist`. After an engine
  change, rebuild core before reading a console.
- A `mission.ts` edit that changes an objective raises `version`, or the progress store
  mixes attempts from two definitions.
- A new decoy that passes its objective means the check is too weak. Strengthen the check
  and keep the decoy.

### 14.8 Workspace wiring

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

`apps/docs/package.json` pins `@evanion/widget` 0.1.0 and `@evanion/react-widget` 0.3.0
exactly, next to Next 16.3.4, Nextra 4.6.1 and React 19.3.0. It also pins `valibot` at
`1.5.0`, so twoslash resolves the same declarations the playground carries.
`examples/meridian` pins `valibot` at `1.5.0` as a dependency and `zod` and `arktype` as dev
dependencies for `/schemas/`. A bump of any of them is a pull request a person opens, and
`doc-seeds` asserts that the version in `examples/meridian`, in `apps/docs` and in the
runtime path agree.

`apps/docs/tsconfig.json` sets `customConditions: []`, so the app resolves `@nexusdi/core`
through its published `exports` to `dist`. The libraries baize-ui spec §7 records why:
`next build` type-checks with a `tsc` that does not build project references, and the
source condition would point at declarations no target emitted (TS6305). The site
documents the published surface for the same reason.

## 15. Build and deploy

### 15.1 Modes

`apps/docs/deploy.json` is committed and holds the deploy's mode, the root's release and
the snapshot's identity:

```json
{
  "mode": "rc",
  "root": { "tag": null, "sha": null, "reason": null },
  "snapshot": {
    "release": "docs-snapshot-0.3",
    "source": "6d5e4f3",
    "revision": 1,
    "assets": {
      "root": { "name": "nexusdi-docs-0.3-root-r1.tar.gz", "sha256": "…" },
      "archive": { "name": "nexusdi-docs-0.3-archive-r1.tar.gz", "sha256": "…" }
    }
  },
  "finalDate": null
}
```

| Mode            | Root of the artifact                                       | Under `/next/`                    | Under `/v0.3/`                    | When                                      |
| --------------- | ---------------------------------------------------------- | --------------------------------- | --------------------------------- | ----------------------------------------- |
| `snapshot-only` | the 0.3 snapshot, root variant                             | nothing                           | nothing                           | Phase 1, until just before rc.0           |
| `rc`            | the 0.3 snapshot, root variant, with the RC posts          | the new site from `main`, no blog | nothing                           | from just before rc.0 to 0.4.0 final      |
| `final`         | the new site from the newest stable release, with the blog | the new site from `main`, no blog | the 0.3 snapshot, archive variant | from 0.4.0 final until the retention ends |
| `retired`       | as `final`                                                 | as `final`                        | redirect stubs to `/upgrade/`     | after the retention ends                  |

A mode change is a one-line pull request, so the swap is reviewed and recorded like any
other change. `snapshot-only` exists so Phase 1 proves the snapshot pipeline in production
and restores a working deploy once `chore/tooling-upgrade` removes `deploy-docs.yml`.

### 15.2 The 0.3 snapshot

`.github/workflows/docs-snapshot.yml` runs on `workflow_dispatch` only, with a `source`
input that defaults to `6d5e4f3`. It holds `contents: write` and `pull-requests: write` for
steps 6 and 7, and its actions carry the same SHA pins as `docs.yml`. Docusaurus exists
only at `6d5e4f3`, so this workflow is the only place the Docusaurus toolchain runs. It
runs once in Phase 1, and once more for each RC post.

1. Check out `main`, then check out `source` into `snapshot-src/`.
2. Set up Node 22 through `actions/setup-node`. The review built `6d5e4f3` on Node 22 in
   73 seconds from a cold cache.
3. Copy the overlay from `apps/docs/snapshot/` into `snapshot-src/docs/`. The overlay has to
   sit inside the site directory, because the review found that Docusaurus fails to
   resolve its preset from a config file outside it. The overlay holds:
   - `docusaurus.overlay.root.ts` and `docusaurus.overlay.archive.ts`, each importing the
     original `docusaurus.config.ts` and overriding a few fields;
   - `blog/`, the RC posts in Docusaurus Markdown, copied into the 0.3 blog;
   - `src/pages/index.tsx`, a copy of the 0.3 landing page whose logo path goes through
     `useBaseUrl`. The original hard-codes `/img/logo-white.svg` (`src/pages/index.tsx:19`),
     which breaks under `/v0.3/`.
4. `npm ci` in `snapshot-src/docs`, then build twice with `docusaurus build --config`:
   - The root variant keeps `baseUrl: '/'` and adds an `announcementBar` whose content is
     HTML with two links: one to the newest RC post, one to `/next/upgrade/`. It reads
     "NexusDI 0.4 is in release candidate. Read the announcement, or the upgrade guide."
   - The archive variant sets `baseUrl: '/v0.3/'`, `noIndex: true`, `blog: false`, a navbar
     Blog item pointing at `https://nexus.js.org/blog/`, and an `announcementBar` that
     cannot be closed: "This is the documentation for NexusDI 0.3, which is deprecated. The
     current documentation is at nexus.js.org, and the upgrade guide is at
     nexus.js.org/upgrade/."
5. Remove `CNAME` from both builds, pack each as a `.tar.gz` named with the next revision
   number, and write `SHA256SUMS`.
6. Upload the archives and the checksum file as assets of the GitHub Release
   `docs-snapshot-0.3`, created on the first run on a tag of the same name at `source`,
   marked not latest.
7. Open a pull request that writes the revision, the asset names and the checksums into
   `deploy.json`.

A release asset is permanent. A workflow artifact expires after at most 90 days, and the
snapshot has to last until the retention ends. The docs deploy downloads the assets with
`gh release download` and verifies each checksum before it unpacks anything.

### 15.3 The docs workflow

`.github/workflows/docs.yml` follows the libraries `docs.yml` and the CI conventions on
`chore/tooling-upgrade`:

- Triggers: `push` to `main` with a `paths` filter (`apps/docs/**`, `libs/**`,
  `internal/**`, `examples/meridian/**`, `tools/doc-examples/**`, `benchmarks/results/**`,
  `package.json`,
  `package-lock.json`, `.github/workflows/docs.yml`), a `push` of an `@nexusdi/core@*` tag,
  and `workflow_dispatch`. `docs-trigger.test.ts` holds the filter against the release
  projects and the docs project's inputs.
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- Concurrency: group `pages`, `cancel-in-progress: false`.
- Every action pinned by commit SHA with the version in a comment, the pins the libraries
  workflow and `ci.yml` already use: `actions/checkout@3d3c42e5…` (v7.0.1),
  `actions/setup-node@82076278…` (v7.0.0), `actions/configure-pages@45bfe019…` (v6.0.0),
  `actions/upload-pages-artifact@fc324d35…` (v5.0.0), `actions/deploy-pages@368f8252…`
  (v5.0.1).
- Node from `.nvmrc`, `npm ci`, and `fetch-depth: 0` so the release notice and the root
  build can read tags.

The build job:

1. Reads `deploy.json`. `snapshot-only` skips steps 2 and 3.
2. Builds the `/next/` site from the checked-out `main` with `DOCS_BASE_PATH=/next` and
   `DOCS_CHANNEL=next`, which leaves `content/blog/` out: `npx nx build docs`, then
   `npm run postbuild` in `apps/docs`.
3. In `final` and `retired`, builds the root site. It resolves the newest `@nexusdi/core@*`
   tag without a prerelease suffix, or `root.sha` when `deploy.json` sets one (section
   15.6), checks it out into a second worktree, copies `apps/docs/content/blog/` and
   `benchmarks/results/` from
   `main` into it, and builds there with an empty base path and `DOCS_CHANNEL=release`.
4. Downloads and verifies the snapshot variant the mode needs.
5. Assembles `site/` per the mode table, writes `CNAME` (`nexus.js.org`) and `.nojekyll`
   at its root, writes the redirect stubs (section 15.6) and the root `404.html`
   (section 15.5).
6. Checks the artifact (section 15.5).
7. Uploads `site/` with `upload-pages-artifact`.

The deploy job runs `deploy-pages` in the `github-pages` environment, as today, and a
`smoke` job follows it (section 17.3).

### 15.4 The base path and search

The `/next/` site builds with `basePath: '/next'`. Next applies the base path to every link,
every asset URL and every `next/link` navigation in the export, and the files in `out/` stay
unprefixed. The assembly step copies that `out/` into `site/next/`.

Search keeps working under the base path. Nextra 4.6.1's search component imports
`addBasePath('/_pagefind/pagefind.js')` and navigates results through `next/link`, which adds
the base path again (`nextra/dist/client/components/search.js`). So Pagefind indexes `out/`
with no `--base-url`, a result carries a root-relative URL such as `/tokens/`, and the link
resolves to `/next/tokens/`. Two end-to-end tests run a search under `/next/`: one follows a
page result, one follows a sub-result anchor on the same page (section 17.3).

Everything the runtime loads uses the base path: `runtime/`, `academy-runtime/` and the
import map URLs (section 11.4). Canonical URLs are absolute and include `/next` on the
`/next/` site.

### 15.5 Artifact checks and the root 404

GitHub Pages serves the root `404.html` for every missing path. During the RC that is the
0.3 snapshot's page, which would answer a missing `/next/…` path with a 0.3 page. So in `rc`
mode the assembly step adds one inline script at the top of the root `404.html`: when the
path starts with `/next/`, it replaces the location with `/next/404.html`, the new site's
404 page. A reader without JavaScript sees the 0.3 404 page, whose announcement bar links
to `/next/upgrade/`. In `final` and `retired` the root `404.html` is the new site's.

The "Check deploy artefacts" step fails the deploy when any of these fails:

- `CNAME` exists once, at the root, and reads `nexus.js.org`. No `CNAME` exists below the
  root.
- `.nojekyll`, `index.html` and `404.html` exist at the root.
- In `rc` mode: `next/index.html`, `next/404.html`, `next/_pagefind/pagefind.js`,
  `next/getting-started.md`, `next/runtime/types-*.json` and one
  `next/runtime/core-*/index.js` exist; no `next/blog/` exists; the snapshot contains no
  `next/` directory of its own; the root `404.html` carries the `/next/` script.
- In `final` mode: everything in the `rc` list under `next/`, plus `blog/atom.xml`,
  `blog/rss.xml`, `blog/index.html` and a page for every post; `v0.3/index.html` exists;
  every HTML file under `v0.3/` carries `noindex`; every `href` and `src` in it starts with
  `/v0.3/` or is external.
- Each site's file count is above zero, and the step prints the counts.

With a custom Actions workflow, GitHub Pages takes the custom domain from the repository
settings and ignores a `CNAME` file. The step keeps the file and checks it anyway, as the
libraries workflow does, so the artifact states its own domain.

nexus.js.org is served through Cloudflare. The zone keeps Rocket Loader and every
HTML-rewriting feature off (section 11.4), passes the Pages headers through, and caches for
the Pages `max-age` of 600 seconds, so a deploy reaches every reader within ten minutes.

### 15.6 The swap at final and the redirect stubs

At 0.4.0 final a pull request sets `mode: "final"` and `finalDate` to the release date.
Core spec §14 owns the 0.4.0 final checklist, and that pull request belongs on it.

From then on the root builds from the newest stable release tag, and `/next/` from `main`
(released-by-default decision 1). A documentation fix merged after a release reaches
`/next/` at once and the root at the next release. When a fix cannot wait, a pull request
sets `root.sha` to a commit that descends from the release tag, with a non-empty `reason`,
on the libraries re-cut pattern (released-by-default decision 7). `docs-deploy.test.ts`
asserts the ancestry and the reason (decision 29).

The swap moves the 0.3 URLs, so the assembly step writes redirect stubs:

- For each HTML path in the root snapshot under `/docs/`, a stub at that path whose
  `<meta http-equiv="refresh">` and `<link rel="canonical">` point at the same path under
  `/v0.3/`.
- For each old blog post URL, a stub pointing at the migrated post's `/blog/<slug>/`, read
  from each post's `legacyUrl`. "Tabula Rasa" keeps its path, so it needs none.
- For the old blog's tag, archive and author pages, a stub pointing at `/blog/`.

The old feed paths, `/blog/rss.xml` and `/blog/atom.xml`, are served by the new site's feed
generator (section 6.2), so a feed reader needs no redirect. Each stub is a small static
HTML page with a visible link, because GitHub Pages has no redirect mechanism. In `retired`
mode the `/v0.3/` paths also become stubs, pointing at `/upgrade/`. `/next/` keeps
building, so it needs no stubs.

### 15.7 Retention of `/v0.3/`

The snapshot stays at `/v0.3/` for six months after `finalDate` or until
`@nexusdi/core@0.5.0` is tagged, whichever is later (core spec §2.4 decision 9).
`docs-deploy.test.ts` fails once both conditions hold and `mode` is still `final`. The
failure says to set `mode: "retired"`. The libraries versioned-docs spec does the same with
its archive guard: a repo-check schedules the deferred step, so nobody has to remember the
date.

The site keeps no other archive before 1.0. `/v0.3/` follows the caret segment grammar of
released-by-default decision 2 (`v0.<minor>` below 1.0). The libraries retain the current
line plus one (versioned-docs decision 10). NexusDI retains nothing when 0.5.0 supersedes
0.4, because the owner set that bound for the pre-1.0 releases.

### 15.8 Search engines

Every page under `/next/` carries `<meta name="robots" content="noindex, follow">`, during
the RC and after. During the RC, search results keep pointing at the 0.3 documentation
users run today. At final the root site is indexed, and the archive variant carries
`noindex` through Docusaurus's `noIndex`. With `follow`, crawlers still follow the links on
an unindexed page to the indexed ones, as released-by-default §10 describes.

### 15.9 The READMEs at rc.0

Core spec §14's rc.0 checklist item 2 adds an info box at the top of the repo root
`README.md` and of `libs/core/README.md`, which npm renders. The box points to the RC, its
documentation at `https://nexus.js.org/next/`, and the "0.4 RC feedback" Discussion. The
rc.0 release commit adds it and 0.4.0 final removes or rewords it. That checklist owns the
item. This spec requires only that `/next/` is deployed in `rc` mode, and the RC post is in
the snapshot, before `nx release` pushes the rc.0 commit, so both links resolve on the day
npm shows them.

## 16. Accessibility and performance budgets

### 16.1 Accessibility

Every page and both tools meet WCAG 2.2 AA.

- Contrast. Section 8.2 sets the floors: 4.5:1 for every text role and 3:1 for control
  borders, in both themes, with the dark surface measured over the brightest pixel the
  background can produce. No text renders directly on the background canvas.
- Motion. `prefers-reduced-motion: reduce` stops the background, sets every transition and
  view transition to 0ms, opens every trace replay paused, and renders `MeridianOnline` in
  its final state. The background animates for longer than five seconds, so the footer and
  the tool headers carry a "Pause background" switch that persists in `localStorage` (WCAG
  2.2.2). The switch reads and writes inside `try`, and the page works when storage throws.
- Keyboard. Every control is reachable and operable by keyboard with a visible focus ring.
  `Escape` then `Tab` leaves the editor. The graph pans and zooms from the keyboard. The
  console follows scrolling and never moves focus.
- Screen readers. Each graph has a text alternative: its caption, and a `<details>` table
  of providers and edges. The error view is a list. The trace replay announces each step
  through `aria-live="polite"`. Objective results are text with an icon beside it. A guided
  card moves focus to its heading when it changes. The reset confirmation is a native
  `<dialog>`.
- Structure. One `h1` a page, headings in order, landmarks from Nextra's layout, and the
  skip link Nextra provides. The tool routes render their own `main` landmark and skip
  link.

### 16.2 Performance budgets

| Budget                                                                              | Limit                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| JavaScript on a content page beyond Nextra's shared chunks, console island excluded | 10 kB gzipped                                              |
| The console island on a concept page, widget libraries included                     | 35 kB gzipped                                              |
| The background module                                                               | 8 kB gzipped; section 9.4 for CPU and GPU                  |
| The Playground before first interaction                                             | 200 kB gzipped, CodeMirror included                        |
| TypeScript worker and declarations                                                  | 1.16 MB gzipped together, loaded on first interaction only |
| Largest contentful paint                                                            | 2.5 s on Lighthouse's mobile profile                       |
| Cumulative layout shift                                                             | 0.05                                                       |
| Interaction to next paint                                                           | 200 ms                                                     |

`apps/docs/tools/check-budgets.mjs` runs after the build. It reads the script tags of each
exported HTML file, gzips every chunk the page references, and fails the build when a page
exceeds its row. The Playwright suite measures the three Web Vitals on the landing page, a
concept page and the Playground with CPU throttled four times through the Chrome DevTools
Protocol, and fails over budget.

## 17. Testing strategy

### 17.1 Unit tests

Vitest, per project:

- `internal/meridian-ui`: the generated CSS matches the generator byte for byte; every
  contrast floor in section 8.2 holds on its stated composite; components import only
  `createElement` and `Fragment`; component props accept formatted strings only, in a type
  test; the background scheduler, under a fake clock and a fake frame source, caps at 30,
  15 and 10 frames a second in the right conditions, draws one frame and no loop under
  reduced motion, `saveData` and the pause switch, stops in a hidden tab, falls back to one
  canvas 2D frame without WebGL2, and releases everything on `stop()`.
- `apps/docs` runtime: the protocol guards accept every message shape and reject a wrong
  `v`, a wrong `runId` and a malformed payload; the serializer renders classes, functions,
  cycles, a `BlueprintError` with its `errors` and a `ProviderError` with its `cause`; the
  transformer rewrites relative imports and inserts `__guard` into every loop and function
  body; `__guard` throws after 1,000 ms in one turn under a fake clock and throws on every
  later call; the stack mapper turns a frame in a `data:` URL into a file and editor line
  through a source map; the harness leaves `instanceof Nexus` true and posts a graph after
  `create`, after `load()` and after a testing container's `create`; the twoslash prelude
  and the worker read the same compiler options.
- `apps/docs` views: the graph layout is deterministic and routes every `lazy` edge outside
  the layers; the trace reducer steps forward and back, opens and closes scope lanes,
  replays `dispose:instance` events in their recorded order, and flags `untracked`; the
  error view draws a ring for each error with a `path` and unwraps a `ProviderError`'s
  `cause`.
- `apps/docs` Academy store: Vitest browser mode on Chromium, against real IndexedDB.
  Records round-trip in every store; a version 1 database opened by a later schema reads
  back unchanged; a second connection closes on `versionchange`; a blocked upgrade shows
  its message; the derived figures (first pass, attempts, hints) match hand-computed
  values; export produces the documented shape; reset deletes the database; a failing
  `indexedDB.open` switches to the in-memory store.
- `apps/docs` tools: the feeds keep `legacyId` for migrated posts and write both old feed
  paths; `PostList` keeps only `kind: post` pages; the deploy assembly lays out each mode
  from fixtures, writes the stubs section 15.6 lists and the root `404.html` script, and
  fails each artifact check when its file is removed; the snapshot overlay files exist and
  the archive overlay sets `blog: false`.
- `tools/doc-examples`: the libraries tests come with the copy, plus a test for the
  `classPrefix` option.

### 17.2 Guards

Every guard has fixture tests that fail on a sabotaged fixture and pass on a clean one, the
libraries pattern. `academy-missions` has a fixture mission whose seed passes an objective
it claims to teach, one whose solution fails an objective, and one whose decoy passes. All
three must fail the guard.

### 17.3 End-to-end tests

`apps/docs-e2e` runs Playwright against `out/` served under `/next/` by a static server
that mimics GitHub Pages (trailing slashes, no rewrites, the root `404.html`), in Chromium,
Firefox and WebKit.

- Playground: `?seed=` loads the seed; no worker request goes out before the first
  interaction; an edit that breaks a type draws a squiggle; Run shows the console output,
  the graph and the trace; `while (true) {}` ends with the loop error within 2 seconds in
  every engine, after which a button on the page responds; a `try` around the loop does
  not keep it running; a microtask loop ends the same way; a run that awaits forever ends
  at the wall clock; a runtime error's stack names the editor file and line; the iframe's
  `sandbox` attribute is exactly `allow-scripts`; code that reads `parent.document` gets an
  error; `fetch` to another origin is refused by the CSP; an unknown seed id shows an error.
- Console: on a 1440px viewport, scrolling a concept page switches the console view per
  section; on a 390px viewport, each view renders inline; with JavaScript disabled, every
  view's static SVG and caption are present; a concept page carries `data-pagefind-body`; a
  seed with a cycle shows the error view with a ring and no graph.
- Academy: mission 1 runs through its guided cards to a pass; mission 6 fails on the seed
  with "FlightLog was built once for two shuttles." and passes on the solution; progress
  persists across a reload; the progress page shows the stats, the storage state and the
  next-mission recommendation; export downloads the documented JSON; reset clears progress;
  with `indexedDB.open` stubbed to throw, the notice appears and the missions still run; a
  full mission run makes no request outside the origin, asserted with request
  interception.
- Background: with reduced motion emulated, no animation frame runs after the first; with
  the page hidden, the loop stops; the module's main-thread time over 10 seconds stays
  inside section 9.4, from a Chrome DevTools Protocol trace; `body`'s computed background is
  transparent.
- Contrast: in dark mode, every element with text has an ancestor surface whose computed
  background alpha is at least 0.86, so the arithmetic floor applies to every text node on
  the page.
- Search: under `/next/`, a Pagefind search for `createScope` returns a result that opens
  `/next/scopes/`, and a sub-result opens `/next/scopes/#<anchor>` and scrolls to the
  heading.
- 404: a missing `/next/…` path reaches the new site's 404 page.
- Accessibility: `@axe-core/playwright` reports no serious or critical violation on one
  page per kind, the Playground and both Academy layouts, in both themes.

After each deploy, the `smoke` job in `docs.yml` requests, through the Cloudflare proxy,
the root, `/next/` and `/v0.3/` as the mode requires, a known `.md` sibling, and in `final`
mode `/blog/rss.xml`. It fails on any status other than 200 and on served HTML containing
`/cdn-cgi/`, which would mean Cloudflare injected a script.

### 17.4 Visual checks

Playwright's `toHaveScreenshot` covers the landing page, Getting started, one concept page
at 1440px and 390px, the API page, the Playground, both Academy layouts, the progress page
and a migrated post, in both themes. `?background=frozen` renders the background's seeded
first frame with no loop, so screenshots are stable. `internal/meridian-ui/src/visual-check.html`
renders every token and component on one page and joins the same suite. A baseline changes
only in a pull request that says why. A widget library bump runs this suite before it
merges.

## 18. Delivery phases

### 18.1 Phase 1: now, beside the engine

In this order:

1. Workspace wiring and the four scaffolds (section 14.8), the libraries pin
   (section 14.5), and the `doc-examples` copy with its tests.
2. `meridian-ui`: tokens, generator, components, the background module and their tests.
3. The `apps/docs` shell: Nextra, the remap, fonts, the base path, the release notice, the
   `(tool)` group, the console grid in `[[...mdxPath]]/page.tsx`, the widget composition,
   `.md` siblings and Pagefind.
4. The guards, with Phase 1 allowances (section 14.3).
5. The deploy pipeline: `docs-snapshot.yml` run once, then `docs.yml` in `snapshot-only`
   mode, so nexus.js.org deploys from the new pipeline as soon as `chore/tooling-upgrade`
   merges.
6. The runtime: worker, sandbox, harness, protocol, stack mapping, kill switch, editor,
   seed registry, console fixtures, and the graph, trace and error views. It builds against
   core spec §10's types with fixture JSON until the engine emits `graph()` and trace
   events, then against each engine build.
7. The Playground route and the Academy shell (store, layouts, progress page, the mission
   guard) with one fixture mission.

Phase 1 settles four points by experiment before anything depends on them:

- `new Worker(new URL('./ts.worker.ts', import.meta.url))` with the TypeScript bundle works
  under Turbopack with `output: 'export'` and `basePath: '/next'`. The fallback is the
  classic worker of section 11.2.
- The sandbox probe the review ran passes again through Cloudflare against the deployed
  site, in Chromium, Firefox and WebKit.
- React 19.3.0's `<ViewTransition>` animates a console view change under Next 16's static
  export. The fallback is in section 10.5.
- Search under `basePath: '/next'` returns links that resolve, anchors included.

A failed experiment reopens its section of this spec before implementation continues.

Phase 1 ends when nexus.js.org deploys from `docs.yml`, the guards pass on their fixtures,
and the Playground runs a seed against the current engine build.

### 18.2 Phase 2: after the 0.4 API passes review

Content waits for the review because every region runs against the API. The order: Start,
then Concepts in teaching order, then Migration (its fences cite the codemod fixtures), the
API reference (it needs core's docblocks), the RC post in the snapshot overlay, the Guides
and the missions.

Required for rc.0:

- Start and Concepts, complete.
- Migration, all six pages, `/support-policy/` included.
- The API reference, all four pages.
- Guides: `/testing/`, `/node-request-scopes/`, `/decorators/` and `/legacy-decorators/`.
  `container.set()` in tests is the most common 0.3 pattern the RC breaks.
  `createChildContainer` was the 0.3 answer for per-request state on a server. Every 0.3
  project enabled `experimentalDecorators`, and `/upgrade/` step 2 links to
  `/legacy-decorators/`. A 0.3 project written with decorators looks for `/decorators/`
  first.
- The Playground, because every concept page links to it.
- The RC announcement in the snapshot overlay (core spec §14, rc.0 checklist item 1), with
  the announcement bar.
- `deploy.json` in `rc` mode, deployed before the rc.0 release commit (section 15.9).

Within the RC window, before 0.4.0 final:

- `/react-router-ssr/`, `/load/`, `/scope-context/`, `/bundlers/`, `/schemas/`,
  `/runtimes/` and `/comparison/`.
- The Academy, all nine missions. The Academy entry stays out of the navbar until missions
  1 to 4 pass the mission guard. Later missions join as each one passes it.
- The blog migration, ready to deploy with the swap.

## 19. Out of scope

- A share-by-code link in the Playground. A link carries a seed id (section 11.9).
- Completions and hover types in the editor. The worker's language service could add them
  later.
- The `dom` lib in the playground (section 11.3).
- Clustering in the graph view beyond 60 nodes.
- The stars and badges interface. The event stores support both (section 13.6).
- Importing Academy progress, syncing it, or accounts.
- Missions for Errors, Introspection and trace, and testing.
- Per-tag blog pages, comments and a newsletter.
- The libraries `/testing` statistics section (section 14.3).
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
- Any change to `@evanion/react-widget` or to core for the docs' sake.

## 20. Open questions

None. The benchmarks spec adopts this spec's token names and adds the `build` family, which
resolves the two items the previous revision held.
