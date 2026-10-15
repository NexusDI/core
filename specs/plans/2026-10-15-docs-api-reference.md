# Docs API Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the eight package API pages of docs spec section 4.3 (rows 43 to 50) on `/next/`, built from the libraries API reference port and styled with the Meridian tokens.

**Architecture:** The reference loader in `tools/doc-examples` expands one `<!-- reference … -->` directive per export into a summary, a collapsed docblock, a `twoslash` signature, what the package's tests state and a `twoslash` example. A new `docs:behaviour-data` target reads every package's test sources into an index (read at build) and a highlighted sidecar (fetched by the reader). Two client components, `ApiFilter` and `BehaviourCatalogue`, sit on top of server-rendered entries and never own them. Guards in `tools/repo-checks` hold the pages to the declarations, the tests and the export lists.

**Tech Stack:** Next 16.3.4, Nextra 4.6.1, React 19.3.0, twoslash 0.3.9, shiki and `@shikijs/twoslash` 3.23.0, TypeScript 6.0.3, Vitest 4, Playwright, Nx 23.

**Spec:** `specs/2026-09-23-docs-site-design.md` on `origin/spec/docs-site` at `4a87f66c`. Read sections 4.3, 5.1, 5.8, 8, 14.1 to 14.3, 16 and 22. Section 22 amends 5.8 and 14.1 to 14.3 and wins where they disagree. The libraries documents it follows are pinned in `apps/docs/libraries-pin.json`; the port copies code from `Evanion/libraries` `main` at `92320250cbb2b5f15483dfae53daf0adb90a57d5`, read with `git -C <libraries-checkout> show 92320250:<path>` from a local clone of `Evanion/libraries` (run `git -C <libraries-checkout> fetch origin main` first; that clone's own branch, `feature/docs-rewrite`, is 471 commits behind `main` and holds the older port).

## Global Constraints

- Branch `feat/docs-api-reference`, worktree `.claude/worktrees/docs-api-reference`, based on `origin/release/0.4`. Rebase on `origin/release/0.4` before the final review; never merge.
- Prefix every `nx` and `git` command with `NX_NO_CLOUD=true NX_DAEMON=false`.
- Run `npm ci` once in the worktree before Task 1. Run `npx nx build @nexusdi/core` (and every lib) before any task that reads `dist`: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t build --projects='libs/*'`.
- No new runtime dependency in any `libs/*` package. Changes inside `libs/*` are docblocks, `describe` titles, doctest regions in `docs/*.md` and the Vitest reporter line (spec section 22, item 11).
- Every commit that copies a libraries file names `Evanion/libraries@92320250` in its body.
- Class names: `nexus-` for app elements, `meridian-` for design-system classes. No literal colour in any stylesheet; every value is a `--meridian-*` property or a `--shiki-*` variable.
- Writing rules of `docs/documentation-style-guide.md` and the ways-of-working skill hold for page prose, comments and commit messages: no em dash, no antithesis, no gerund subject, no bold lead-in in comments or commits, no word "native" next to "decorator", interface-first examples (`Token<IFoo>` with `provide(FOO, { useClass })`).
- Commit scopes: `doc-examples`, `docs`, `docs-e2e`, `meridian-ui`, `repo` (repo-checks), and the package name for a change under `libs/<pkg>` (`docs(core): …` for a docblock, `test(core): …` for a test title). commitlint refuses a capitalised word in the subject.
- Never run `git stash`. Use a WIP commit.

## The task gate

Every task ends with this gate. A task is done only when every command passes.

```bash
NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck --projects=@nexusdi/doc-examples,@nexusdi/meridian-ui,@nexusdi/docs,@nexusdi/repo-checks
NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/docs:check-budgets
npm run postbuild --workspace @nexusdi/docs
NX_NO_CLOUD=true NX_DAEMON=false npx nx e2e @nexusdi/docs-e2e
npx prettier --check .
```

The first line is the docs build plus the repo-checks; the second to fourth are the docs checks. A task that touches `libs/<pkg>` adds that project to `--projects`. Suspect a stale `apps/docs/.next` (`rm -rf apps/docs/.next`) or a stale `libs/*/dist` before suspecting new code (docs-page skill, Traps).

## Review Focus

1. The `/next/` base path. A reader on `/next/api-devtools/` opens a catalogue and the case loads from `/next/behaviour/devtools/graph.json`. A fetch of `/behaviour/devtools/graph.json` 404s there and the pane says the cases did not load. Task 9 unit-tests the URL and Task 10's end-to-end test watches the request.
2. A reader with no JavaScript, and the search index. Every entry, every summary, every docblock paragraph and every test sentence is in the static HTML, and the filter row is absent. Task 10's end-to-end test reads the raw HTML; Task 9 tests that `ApiFilter` writes `hidden` and never removes an entry.
3. A phone at 375 px. A 150-character signature and a test case body must not scroll the page sideways, and the case pane sits under the rail, a sibling of the listbox and never inside it. Task 10 asserts `scrollWidth <= clientWidth` at 375 px on `/next/api/`, which Task 13 adds.
4. Light mode. The case highlighting uses `--shiki-light` when `html` lacks `.dark`, and every text node of an API page sits on a surface of at least 0.86 alpha in both themes. Task 9 tests the stylesheet mapping and Task 10 adds the API pages to `surfaces.spec.ts`.
5. A package that changes after this merges. A new export with no entry, a renamed `describe` that leaves a stale sentence, an export with no docblock, or a region name present in two files each fail a guard that names the file and the fix. Tasks 2, 7, 10 and 14 carry one test each.

## 1. What is ported, adapted and dropped

Paths on the left are in `Evanion/libraries` at `92320250`.

| Libraries source                                                                                  | Here                                                                                                     | Treatment                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/doc-examples/src/behaviours.mjs`                                                           | same path                                                                                                | Adapt: take `dedent` with offsets and `bodyOf` returning `{ body, offsets }`; keep NexusDI's `filesUnder` walk and comments (Task 1)                                                                                                                                                            |
| `tools/doc-examples/src/declarations.mjs`                                                         | same path                                                                                                | Adapt: take `importedFrom`, `external` and the `${root}\0${specifier}` program key; keep `fromRoot`; `readme` becomes `examples: string[]` (Task 2)                                                                                                                                             |
| `tools/doc-examples/src/examples-file.mjs`                                                        | same path, new                                                                                           | Adapt: one package holds `README.md` plus every `docs/*.md`, so `examplesFilesIn` returns a list and `regionFileOf` picks the one file holding a region (Task 2)                                                                                                                                |
| `tools/doc-examples/src/mdx-reference-loader.mjs`                                                 | same path                                                                                                | Adapt: external imports in the signature fence, examples lookup, `kindPrefix`, the count as a span, `<Chip>` kept (Tasks 2 and 3)                                                                                                                                                               |
| `apps/docs/tools/behaviour-data.mjs`                                                              | same path, new                                                                                           | Adapt: `@nexusdi/source` condition, NexusDI's library list, Nextra's shiki themes through `code-classes.mjs`, one sidecar per stated identifier (Task 6)                                                                                                                                        |
| `apps/docs/tools/libraries.mjs`                                                                   | same path, new                                                                                           | Rewrite: every `libs/*` package whose `exports` map holds an entry other than `./package.json` (Task 6)                                                                                                                                                                                         |
| `apps/docs/package.json` target `behaviour-data`                                                  | `apps/docs/package.json`                                                                                 | Adapt: inputs name NexusDI paths; `build`, `typecheck` and repo-checks `test` depend on it (Task 6)                                                                                                                                                                                             |
| `apps/docs/components/api/ApiFilter.tsx`, `api.css`                                               | same paths                                                                                               | Port the behaviour, restyle with Meridian tokens, read `nexus-api-entry` and `meridian-kind-*` (Task 9)                                                                                                                                                                                         |
| `apps/docs/components/api/BehaviourCatalogue.tsx`, `behaviour.css`, `BehaviourCatalogue.test.tsx` | same paths                                                                                               | Port the behaviour, fetch through `NEXUS_BASE_PATH`, frame the pane with `ConsoleFrame`, restyle (Task 9)                                                                                                                                                                                       |
| `apps/docs/app/global.css` lines 325 to 520 (the `.docs-api-entry` rules)                         | `apps/docs/components/api/entry.css`, new                                                                | Restyle into a sheet `mdx-components.js` imports (Task 9)                                                                                                                                                                                                                                       |
| `tools/repo-checks/src/doc-reference.test.ts`                                                     | `tools/repo-checks/src/doc-reference.test.ts`, new, beside the existing `doc-examples-reference.test.ts` | Adapt: NexusDI package names, `authoredPages` from `docs/site.ts`, plus the docblock-summary rule (Task 10)                                                                                                                                                                                     |
| `tools/repo-checks/src/doc-behaviour.test.ts`                                                     | same path, new                                                                                           | Adapt: export lists from `@nexusdi/doc-examples/package-exports`; drop `declarer` and test that every callable is declared under its own package's `src`; keep the `libs/core/src/security` exemption in `testFilesOf`; add the white-box rule with `HELPERS`; `ACCEPTED` starts empty (Task 8) |
| `tools/repo-checks/src/doc-behaviour-run.test.ts`                                                 | same path, new                                                                                           | Adapt: the report path each `libs/*/vite.config.ts` writes (Task 7)                                                                                                                                                                                                                             |
| `tools/repo-checks/src/doc-behaviour-render.test.ts`                                              | same path, new                                                                                           | Adapt: the stylesheet test reads `components/api/behaviour/code-classes.css` in place of `public/code-classes.css`, and every sidecar per export (Tasks 1 and 6)                                                                                                                                |
| `tools/repo-checks/src/doc-twoslash.test.ts`                                                      | same path, new                                                                                           | Adapt: compile with the prelude of Task 4 (Task 4)                                                                                                                                                                                                                                              |
| `tools/repo-checks/src/doc-export-coverage.test.ts`, `released-exports.ts`                        | `tools/repo-checks/src/doc-export-coverage.test.ts` and `docs/doc-export-coverage.ts`                    | Adapt: find each package's page by `package` frontmatter; core error classes exempt from headings; exercised half keeps an allowance (Task 14)                                                                                                                                                  |
| baize-ui `Chip`                                                                                   | `internal/meridian-ui/src/components/chip.tsx`, new                                                      | New stateless component (Task 5)                                                                                                                                                                                                                                                                |
| baize-ui `Figure` inside the loader output                                                        | none                                                                                                     | Drop: the count renders as `<span className="nexus-api-entry__states-count-value">`; `<Figure>` stays the benchmark figure                                                                                                                                                                      |
| `apps/docs/tools/code-classes.mjs`, `code-classes.test.mjs`                                       | same paths                                                                                               | Adapt: the cases only, since Nextra highlights the page fences; `behaviour-data.mjs` writes the stylesheet to `components/api/behaviour/code-classes.css` and the catalogue imports it (Tasks 6 and 9)                                                                                          |
| `apps/docs/tools/test-statistics.mjs`, `testing-data`, the `/testing` section                     | none                                                                                                     | Drop (spec section 14.3)                                                                                                                                                                                                                                                                        |
| `tools/doc-examples/src/md-siblings.mjs`                                                          | unchanged except options                                                                                 | Keep: it passes the options module of Task 3                                                                                                                                                                                                                                                    |

## 2. The restyle

The site already has its look (spec section 8): a deep-space HUD with glass panels on the `hull`, Space Grotesk headings, IBM Plex Sans body, IBM Plex Mono micro labels, cyan focus and edges. The owner's front page notes (`~/Vaults/NexusDI/Front page.md`) set the game-UI chrome (bevelled pills, raised panels) for the landing schematic only; a reference page is a lookup page and stays on the docs chrome.

Tokens, all existing in `@nexusdi/meridian-ui`:

| Role on the page                        | Token                                                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page ground and article surface         | `--meridian-hull` (the article already paints it)                                                                                                                                                  |
| Sticky filter row, case pane, type card | `--meridian-hull-raised` with `--meridian-elevation-raised`                                                                                                                                        |
| Export name and its kind rules          | `--meridian-kind` (bound by `.meridian-kind-<kind>`: error `statusFail`, class `signalCyan`, function `statusPass`, constant `signalAmber`, interface `signalMagenta`, type alias `textSecondary`) |
| Hairlines between entries               | `--meridian-rule`                                                                                                                                                                                  |
| Secondary text, counts, notes           | `--meridian-text-secondary`, `--meridian-text-tertiary`                                                                                                                                            |
| Controls                                | `--meridian-control-border`, `--meridian-radius-control`, `--meridian-focus`                                                                                                                       |
| Chip                                    | `--meridian-radius-chip`, mono `--meridian-text-micro`, `--meridian-tracking-micro`                                                                                                                |
| Headings                                | `--meridian-font-display`; body `--meridian-font-body`; code and labels `--meridian-font-mono`                                                                                                     |

Layout. One column, the article's measure for prose, the full column width for signatures and the catalogue.

```
desktop (≥ 48rem)                                phone (< 48rem)
┌ sticky filter ─────────────────────────────┐   ┌ filter ─────────────┐
│ [Filter by name……] fn iface type … 17 exp. │   │ [Filter by name…]   │
└────────────────────────────────────────────┘   │ fn iface type …     │
── rule ──────────────────────────────────────   │ 17 exports          │
graph                         [function]         └─────────────────────┘
Summary sentence.                                graph      [function]
▸ More about graph                               Summary sentence.
┌ signature (wraps) ─────────────────────────┐   ▸ More about graph
│ declare module '@nexusdi/devtools' { … }   │   ┌ signature (wraps) ──┐
└────────────────────────────────────────────┘   └─────────────────────┘
│ What the tests state            12 behaviours  │ What the tests state
│ ┌ rail ─────────┐ ┌ LIBS/DEVTOOLS/…:42 ────┐   │ ┌ rail ────────────┐
│ │ • sentence 1  │ │ sentence 1              │   │ │ • sentence one   │
│ │   sentence 2  │ │ const view = graph(…)   │   │ └──────────────────┘
│ └───────────────┘ └─────────────────────────┘  │ ┌ case pane ───────┐
┌ example (twoslash) ────────────────────────┐   ┌ example ────────────┐
```

The one memorable element is the case pane: it reuses the ship console's frame (`ConsoleFrame`), so a test case reads as a readout from the ship's own console, with the test file and line in the console's mono title row and a cyan corner marker. Everything else stays quiet: no card per entry, no per-entry hover, no entrance animation. Motion is the native `<details>` disclosure and the console's existing transition, both under `prefers-reduced-motion`.

Light and dark. Every token switches with `html.dark` already (`tokens.generated.css`), and `contrast.test.ts` holds each kind hue to 4.5:1 on the hull in both themes. The case HTML carries `--shiki-light` and `--shiki-dark` per token; `behaviour.css` picks one by theme.

Phone width. The filter row wraps with the query on its own line; signatures use `white-space: pre-wrap`; the catalogue below `48rem` stacks the pane under the rail, a sibling after the listbox in both layouts, and the pane's `<pre>` scrolls inside itself (`overflow-x: auto`) so the page never does.

## 3. Pages

This branch covers every package already on `release/0.4` that has a library entry. `@nexusdi/cli` has no library export and no page (spec section 4.3).

| Path                   | `package`               | Entries                     | Entry points     |
| ---------------------- | ----------------------- | --------------------------- | ---------------- |
| `/api/`                | `@nexusdi/core`         | 90 (error classes excepted) | `.` and `./text` |
| `/api-testing/`        | `@nexusdi/testing`      | 5                           | `.`              |
| `/api-node/`           | `@nexusdi/node`         | 2                           | `.`              |
| `/api-decorators/`     | `@nexusdi/decorators`   | 5                           | `.`              |
| `/api-devtools/`       | `@nexusdi/devtools`     | 17                          | `.`              |
| `/api-federation/`     | `@nexusdi/federation`   | 5                           | `.` and `./text` |
| `/api-errors-package/` | `@nexusdi/errors`       | 4                           | `.`              |
| `/api-interceptors/`   | `@nexusdi/interceptors` | 22                          | `.` and `./text` |

The slugs are the spec's. `/api/` is core because `doc-floor` already requires a `reference` page at `api` and `doc-floor-allowance.json` records the wait. `/api-errors-package/` keeps its suffix because `/api-errors/` is the error-code table.

Later packages add their own pages in their own pull requests (spec section 22, item 10). After this branch merges, `doc-export-coverage` fails any merge that adds an export or a library without its entry:

- `feat/startup-profiler` (PR #116) adds `profile`, `Profiler`, `ProfileOptions`, `CpuProfile`, `LiveSink`, `CriticalPath`, `ProfileBuild`, `ProfileInit`, `ProfileReport`, `ProfileRun`, `TraceFile`, `criticalPath`, `profileTable`, `parseProfileReport`, `profileStartup`, `toChromeTrace`, `toPerfettoTrace` to `@nexusdi/devtools`, the `./live` entry, and `RunKind` to core. Its plan's task 22 (blocked on this branch) adds one `## \`name\``and directive per export to`/api-devtools/`and`/api/`, after `describe`blocks and docblocks pass G11 and`doc-reference`. If PR #116 merges first, this branch's Task 12 and Task 13 cover those exports after the rebase.
- `feat/integrations-0.4` adds `express`, `fastify`, `hono`, `react`, `react-router` and `vitest`. Each adds `apps/docs/content/api-<dir>.mdx` with `kind: reference` and `package: '@nexusdi/<dir>'`, an entry under the API separator of `_meta.ts`, and region files under `libs/<dir>/docs/`. `docs:behaviour-data` picks the package up from its `package.json` with no edit.

The recipe for a new page is the one Task 10 follows for `/api-node/`, and Task 14 adds it to the docs-page skill as a short section.

## 4. Entries, regions, docblocks and guards

Each entry needs three things from its package:

1. A docblock whose first paragraph says what the export is or does. `doc-reference` fails an entry without one (spec section 22, item 8). 35 exports have none today: core `optional`, `lazy`, `all`, `CheckOptions`, `CompileContext`, `CompilePluginHooks`, `ConfigurableModuleConfig`, `CreateOptions`, `EdgeView`, `FactoryDefinition`, `LookupOptions`, `ModuleConfig`, `ModuleView`, `NexusErrorOptions`, `PluginContext`, `PromiseTokenMessage`, `ProviderRewrite`, `ProviderView`, `RootKeyMessage`, `UntypedFunctionMessage`; testing `createTestingContainer`, `TestingContainerBuilder`, `TestingCreateOptions`, `ModuleOverrideOptions`; node `NodeScopes`; devtools `DevtoolsOptions`, `RenderOptions`; federation `Contract`; interceptors `GlobalEntry`, `GlobalTarget`, `InterceptorErrorCode`, `InterceptorsOptions`, `InterceptorToken`, `InvalidReason`, `TapObserver`. Measured with `readReference` over every export against `libs/*/dist` at `7bd9b8f`.
2. For a callable, a `describe` in its own package's tests that spells its name. G11 fails a callable non-error export without one. Three have none today: core `moduleDefinitionOf`, core `layoutText` (`./text`), interceptors `interceptors`. No `describe` naming one export sits inside another's in any package (measured).
3. Optionally, `example=<region>` naming a region in `libs/<pkg>/README.md` or `libs/<pkg>/docs/*.md`. The page tasks assign the existing regions and add four: `optional` and `all` in `libs/core/docs/providers.md`, `to-dot` in `libs/devtools/docs/examples.md`, `use-interceptors` in `libs/interceptors/docs/examples.md`. A type gets no example (libraries decision 16).

Guards this branch adds, each with its exceptions written inline beside the rule:

| Guard                     | Rule                                                                                                                                                   | Exceptions                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `doc-reference`           | every directive names a real export; a merging kind hovers its own docs; every named export has a docblock summary                                     | none                                                                                                 |
| G11 `doc-behaviour`       | every non-error callable export has a `describe` naming it in its package; no export `describe` nests in another's                                     | `ACCEPTED` starts empty; an error class (name ends in `Error`) is exempt by rule                     |
| `doc-behaviour-run`       | every sentence in `components/api/behaviour/*.json` is a case or a group the package's last run reported                                               | none                                                                                                 |
| `doc-behaviour-render`    | `chainsOf`, the stated block and the sidecar agree, and the case HTML uses only `--shiki-*` colour variables                                           | none                                                                                                 |
| `doc-twoslash`            | every `twoslash` fence and every doctest fence in `libs/*/README.md` and `libs/*/docs/*.md` compiles under the prelude; declared `@errors` still occur | none                                                                                                 |
| G10 `doc-export-coverage` | each library has one `reference` page by `package`; every export has a `##` there; every callable appears in an executable fence                       | core error classes exempt from headings; the exercised half has `doc-export-coverage-allowance.json` |

None of these exceptions needs the owner. Test and CI policy is the architect's and the tech lead's (ways-of-working, Owner-only).

## Owner-only items

- Merging the pull request of this branch into `release/0.4` (spec section 20, item 2). The plan ends with an open pull request.
- Any npm publish. This branch publishes nothing.

Everything else in this plan is settled.

## File structure

```
tools/doc-examples/src/
  behaviours.mjs, behaviours.d.mts          offsets beside each body (T1)
  examples-file.mjs, examples-file.d.mts    new: the files a package's regions live in (T2)
  declarations.mjs, declarations.d.mts      external imports, `examples` list (T2)
  mdx-reference-loader.mjs, .d.mts          kindPrefix, count span, external imports, region lookup (T2, T3)
apps/docs/
  tools/reference-options.mjs, .d.mts       new: { classPrefix, kindPrefix } (T3)
  tools/loader-chain.mjs                    prelude first, options module (T3, T4)
  tools/md-siblings.mjs                     options module (T3)
  tools/mdx-twoslash-prelude.mjs, .test.mjs new (T4)
  components/runtime/compiler-options.ts    new (T4)
  components/runtime/runtime-globals.d.ts   new (T4)
  tools/libraries.mjs, .test.mjs            new (T6)
  tools/behaviour-data.mjs                  new (T6)
  components/api/ApiFilter.tsx, api.css     new (T9)
  components/api/BehaviourCatalogue.tsx, behaviour.css, BehaviourCatalogue.test.tsx  new (T9)
  components/api/ApiFilter.test.tsx         new (T9)
  components/api/entry.css, entry-css.test.ts  new (T9)
  mdx-components.js                         Chip, ApiFilter, BehaviourCatalogue, entry.css (T9)
  next.config.ts                            env NEXUS_BASE_PATH (T9)
  content/api*.mdx, content/_meta.ts        the pages (T10 to T13)
apps/docs-e2e/src/api-reference.spec.ts     new (T10, T13)
apps/docs-e2e/src/surfaces.spec.ts          API pages added (T10)
internal/meridian-ui/src/components/chip.tsx, styles.css, index.ts  (T5)
tools/repo-checks/src/
  doc-twoslash.test.ts                      new (T4)
  doc-behaviour-render.test.ts              new (T1, T6)
  doc-behaviour-run.test.ts                 new (T7)
  doc-behaviour.test.ts                     new (T8)
  doc-reference.test.ts                     new (T10)
  doc-export-coverage.test.ts, docs/doc-export-coverage.ts, doc-export-coverage-allowance.json  new (T14)
  doc-examples-reference.test.ts            updated (T2, T3)
  docs/loaders.ts                           options module (T3)
libs/*/vite.config.ts                       json reporter (T7)
libs/<pkg>/src/**                           docblocks (T10 to T13), describe titles (T8)
libs/core/docs/providers.md, libs/devtools/docs/examples.md, libs/interceptors/docs/examples.md  new regions (T12, T13)
.claude/skills/docs-page/SKILL.md           "Adding an API page" (T14)
```

---

### Task 1: Carry each case body's file offsets

The catalogue's type hovers come from compiling a whole test file once (Task 6), which needs to know where each body's characters stood in the file. The libraries `behaviours.mjs` at `92320250` returns them; NexusDI's port predates that.

**Files:**

- Modify: `tools/doc-examples/src/behaviours.mjs` (functions `dedent`, `bodyOf`, the `chainsOf` push)
- Modify: `tools/doc-examples/src/behaviours.d.mts` (`Chain`)
- Create: `tools/repo-checks/src/doc-behaviour-render.test.ts` (the `chainsOf` block only)

**Interfaces:**

- Produces: `Chain.offsets: number[]`, where `offsets[i]` is the file position of `body[i]`. `chainsOf(path)` and `behavioursOf(root)` keep their signatures.

- [ ] **Step 1: Write the failing test.** Create `tools/repo-checks/src/doc-behaviour-render.test.ts` with the `chainsOf` describe from the libraries file (`git -C <libraries-checkout> show 92320250:tools/repo-checks/src/doc-behaviour-render.test.ts`, lines 1 to 176), with `@evanion/doc-examples` replaced by `@nexusdi/doc-examples`, and add this case inside `describe('chainsOf', …)`:

```ts
it('maps every character of a body back to where it stood in the file', () => {
  const source = [
    "describe('widen', () => {",
    "  it('keeps the key', () => {",
    '    const kept = widen(listing);',
    '    expect(kept).toBe(listing);',
    '  });',
    '});',
  ].join('\n');
  const [found] = chainsOf(write(source));

  expect(found.offsets).toHaveLength(found.body.length);
  for (const [at, offset] of found.offsets.entries()) {
    expect(source[offset]).toBe(found.body[at]);
  }
});
```

`write` is the fixture helper the libraries file defines at its top (it writes a temporary `.test.ts` and returns its path). Keep it.

- [ ] **Step 2: Run it and watch it fail.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-behaviour-render`
      Expected: FAIL, `found.offsets` is `undefined`.

- [ ] **Step 3: Port the offsets.** In `behaviours.mjs`, replace `dedent(text)` with the libraries `dedent(text, base)` (libraries lines 116 to 166, which return `{ body, offsets }`), replace `bodyOf` with the libraries version (lines 167 to 205, which passes `node.getStart(source)`, `callback.body.getStart(source) + 1` and `callback.getStart(source)` as `base`), and change the push in `chainsOf` from `body: bodyOf(…)` to `...bodyOf(…)`. Keep NexusDI's `filesUnder` walk and every NexusDI comment; replace the two comment lines that say `450 of \`@nexusdi/core\`'s` and `` `ruleId`'s lines are executed by 19 of `@nexusdi/core`'s test files `` with sentences that hold for this repository or delete them (they were mechanical renames of libraries facts). Add `offsets: number[];`with a one-line comment to`Chain`in`behaviours.d.mts`.

- [ ] **Step 4: Run the test.** Same command. Expected: PASS.

- [ ] **Step 5: Run the task gate.**

- [ ] **Step 6: Commit.**

```bash
git add tools/doc-examples/src/behaviours.mjs tools/doc-examples/src/behaviours.d.mts tools/repo-checks/src/doc-behaviour-render.test.ts
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(doc-examples): carry where each case body stood in its file" -m "Ported from Evanion/libraries@92320250."
```

### Task 2: Read examples from a package's region files, and import external types

NexusDI keeps each package's examples in `README.md` and `docs/*.md` (core has six files). The loader reads only the README, and a signature that names another package's type (devtools naming core's `BlueprintView`) fails to compile without its import.

**Files:**

- Create: `tools/doc-examples/src/examples-file.mjs`, `tools/doc-examples/src/examples-file.d.mts`
- Modify: `tools/doc-examples/package.json` (export `./examples-file`)
- Modify: `tools/doc-examples/src/declarations.mjs`, `declarations.d.mts` (`examples`, `external`, program cache key)
- Modify: `tools/doc-examples/src/mdx-reference-loader.mjs` (`exampleFence`, `libraryOf`, `signatureFence`, the loader's `onResolve`)
- Modify: `tools/repo-checks/src/doc-examples-reference.test.ts`

**Interfaces:**

- Produces: `examplesFilesIn(packageDir: string): string[]` (absolute paths, `README.md` first, then `docs/*.md` sorted); `packageDirOf(file: string): string`; `regionFileOf(files: string[], region: string, read?: (path: string) => string): string`, which throws `RegionError` naming every file when zero or more than one holds the region.
- Produces: `Reference.examples: string[]` (workspace-relative), replacing `Reference.readme`; `Reference.signature.external: [specifier: string, names: string[]][]`.

- [ ] **Step 1: Write the failing tests.** Add to `tools/repo-checks/src/doc-examples-reference.test.ts`:

````ts
import {
  examplesFilesIn,
  packageDirOf,
  regionFileOf,
} from '@nexusdi/doc-examples/examples-file';

describe('examples files', () => {
  it('lists the README, then every docs file in name order', () => {
    const dir = join(root, 'libs/core');
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# core\n');
    writeFileSync(join(dir, 'docs/scopes.md'), '');
    writeFileSync(join(dir, 'docs/errors.md'), '');
    expect(examplesFilesIn(dir)).toEqual([
      join(dir, 'README.md'),
      join(dir, 'docs/errors.md'),
      join(dir, 'docs/scopes.md'),
    ]);
  });

  it('maps a docs file back to its package directory', () => {
    expect(packageDirOf('libs/core/docs/scopes.md')).toBe('libs/core');
    expect(packageDirOf('libs/core/README.md')).toBe('libs/core');
  });

  it('finds the one file that holds a region', () => {
    const files = ['a.md', 'b.md'];
    const read = (path: string) =>
      path === 'b.md'
        ? '<!-- #region scopes -->\n```ts\nx\n```\n<!-- #endregion scopes -->\n'
        : '';
    expect(regionFileOf(files, 'scopes', read)).toBe('b.md');
  });

  it('refuses a region two files hold, naming both', () => {
    const both = () =>
      '<!-- #region scopes -->\n```ts\nx\n```\n<!-- #endregion scopes -->\n';
    expect(() => regionFileOf(['a.md', 'b.md'], 'scopes', both)).toThrow(
      /a\.md.*b\.md/s,
    );
  });

  it('refuses a region no file holds, naming every file it read', () => {
    expect(() => regionFileOf(['a.md', 'b.md'], 'gone', () => '')).toThrow(
      /gone.*a\.md.*b\.md/s,
    );
  });
});
````

Port the libraries `doc-reference.test.ts` cases `imports a type the declaration file takes from another package`, `imports an external type from the package the declaration took it from` and `writes one import line per external package, with its names on it` (libraries lines 144 to 158 and 277 to 320) into this file, pointed at `@nexusdi/devtools#graph` for the reader half (its declaration names `Nexus` from `@nexusdi/core`) and at the stub reader for the expansion half. Update the file's `reference()` stub: `readme` becomes `examples: ['libs/core/README.md']` and `signature` gains `external: []`.

- [ ] **Step 2: Run them and watch them fail.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-examples-reference`
      Expected: FAIL, `@nexusdi/doc-examples/examples-file` does not resolve.

- [ ] **Step 3: Write `examples-file.mjs`.**

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { RegionError, readRegion } from './regions.mjs';

/**
 * The files a package's examples live in, as the docs site cites them.
 *
 * The README is the package's npm landing page and carries its first
 * example. The examples a docs page or a reference entry names live in
 * `docs/*.md`, which the package's `files` leaves out of the tarball. Both run
 * as tests of the package, through `docExampleSources()`. Core keeps one file
 * per subject (`docs/providers.md`, `docs/scopes.md`), so this returns a list.
 */
export function examplesFilesIn(packageDir) {
  const docs = join(packageDir, 'docs');
  const pages = existsSync(docs)
    ? readdirSync(docs)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(docs, name))
    : [];
  return [join(packageDir, 'README.md'), ...pages];
}

/** The package directory a markdown file of examples belongs to. A path operation only. */
export function packageDirOf(file) {
  const dir = dirname(file);
  return basename(dir) === 'docs' ? dirname(dir) : dir;
}

/**
 * The one file among `files` that holds `region`.
 *
 * A region name is unique within a package, so a directive names a region and
 * no file. Two files holding one name would make the entry's example depend on
 * the order this reads them in, so that fails, and so does a name no file holds.
 */
export function regionFileOf(
  files,
  region,
  read = (path) => readFileSync(path, 'utf8'),
) {
  const holding = files.filter((file) => {
    try {
      readRegion(read(file), file, region);
      return true;
    } catch (error) {
      if (error instanceof RegionError) return false;
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  });
  if (holding.length === 1) return holding[0];
  throw new RegionError(
    holding.length === 0
      ? `no file holds the region '${region}'; read ${files.join(', ')}`
      : `the region '${region}' is in ${holding.join(' and ')}; rename one`,
  );
}
```

Check that `readRegion` in `regions.mjs` throws `RegionError` for a missing region; if it throws for a malformed one too, keep that error (a malformed region is a defect to report, so let it propagate: narrow the `catch` to the message `readRegion` uses for a missing name). Write `examples-file.d.mts` with the three signatures and add `"./examples-file": { "types": "./src/examples-file.d.mts", "default": "./src/examples-file.mjs" }` to `tools/doc-examples/package.json`, in the shape its other entries use.

- [ ] **Step 4: Port the declaration changes.** In `declarations.mjs`: copy `packageNameOf` and `importedFrom` from libraries `declarations.mjs` (lines 215 to 250); add `const external = new Map();` and the `importedFrom` branch inside `place` (libraries lines 372 to 376) after the `root.has(each)` branch; return `external: [...external]`; key `programs` by `` `${root}\0${specifier}` `` (libraries lines near `programOf`); replace the `readme:` field with `examples: examplesFilesIn(packageDir).map((path) => relative(root, path).split('\\').join('/'))`. Update `declarations.d.mts`: `examples: string[]` with the comment "The package's example files, workspace relative: `README.md`, then `docs/*.md`.", and `external: [specifier: string, names: string[]][]` inside `signature` with the comment "Types the declaration file imports from another package."

- [ ] **Step 5: Port the loader changes.** In `mdx-reference-loader.mjs`:
  - `signatureFence`: after the `fromRoot` import line, add the libraries lines `...(signature.external ?? []).map(([specifier, names]) => \`import type { ${names.join(', ')} } from '${specifier}';\`)`.
  - `libraryOf`: `return basename(packageDirOf(join('/', reference.examples[0])));`
  - `exampleFence(root, reference, region, file)`:

````js
function exampleFence(root, reference, region, file) {
  const files = reference.examples.map((each) => join(root, each));
  let path;
  try {
    path = regionFileOf(files, region);
  } catch (error) {
    throw new Error(
      `${file}: '${reference.name}' names an example region. ${error.message}`,
    );
  }
  const found = readRegion(readFileSync(path, 'utf8'), path, region);
  const code = withPreamble(readPreamble(packageDirOf(path)), found.code);
  return ['```ts twoslash', ...code.split('\n'), '```'];
}
````

- The default export's `onResolve`: call `this.addDependency(join(root, each))` for every `each` of `reference.examples` (it watches the README alone today), and keep the preamble and behaviour dependencies.
- Update the doc comment above `exampleFence` to say "the named region of the package's example files".

- [ ] **Step 6: Run the tests.** Same command. Expected: PASS. Then run `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-md-siblings doc-examples` and expect PASS (no page carries a directive yet).

- [ ] **Step 7: Run the task gate.**

- [ ] **Step 8: Commit.**

```bash
git add tools/doc-examples tools/repo-checks/src/doc-examples-reference.test.ts
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(doc-examples): read reference examples from every region file of a package" -m "A package keeps its examples in README.md and docs/*.md. The loader finds the one file holding a region and fails on none or two. A signature imports the types its declaration file takes from another package. Ported from Evanion/libraries@92320250, adapted to a list of files."
```

### Task 3: Emit markup the Meridian site defines

The loader emits `nexus-kind-<kind>`, a class no stylesheet defines, and `<Figure>`, which on this site is the benchmark figure and fails without `of` (spec section 22, items 3 and 4).

**Files:**

- Create: `apps/docs/tools/reference-options.mjs`, `apps/docs/tools/reference-options.d.mts`
- Modify: `tools/doc-examples/src/mdx-reference-loader.mjs`, `mdx-reference-loader.d.mts`
- Modify: `apps/docs/tools/loader-chain.mjs`, `apps/docs/tools/md-siblings.mjs`, `tools/repo-checks/src/docs/loaders.ts`, `tools/doc-examples/src/md-siblings.mjs` (its options type comment)
- Modify: `tools/repo-checks/src/doc-examples-reference.test.ts`, `apps/docs/tools/loader-chain.test.mjs`

**Interfaces:**

- Produces: `export const referenceOptions = Object.freeze({ classPrefix: 'nexus', kindPrefix: 'meridian' })` from `apps/docs/tools/reference-options.mjs`.
- Produces: `ExpandReferencesOptions.kindPrefix: string` (required, same shape check as `classPrefix`). The entry wrapper becomes `<div className="nexus-api-entry meridian-kind-<kind>">`.

- [ ] **Step 1: Write the failing tests.** In `doc-examples-reference.test.ts`, change every `expandReferences(…, { classPrefix: 'nexus', … })` call to pass `kindPrefix: 'meridian'` too, and add:

```ts
it('puts the kind class in the design system prefix', () => {
  const out = expand(page);
  expect(out).toContain(
    '<div className="nexus-api-entry meridian-kind-function">',
  );
  expect(out).not.toContain('nexus-kind-');
});

it('fails at load time without a kindPrefix', () => {
  expect(() =>
    expandReferences(page, root, 'page.mdx', {
      classPrefix: 'nexus',
      read: reference,
    }),
  ).toThrow(/kindPrefix/);
});

it('writes the behaviour count as a span, leaving <Figure> to the benchmarks', () => {
  const out = expand(page);
  expect(out).not.toContain('<Figure>');
});
```

`expand` is the helper the file already uses for `expandReferences(source, root, 'page.mdx', { classPrefix: 'nexus', kindPrefix: 'meridian', read: reference })`; add it if the file inlines the call. For the count case, give the stub behaviours file in `beforeAll` one stated chain under `create` (`states: { create: [{ chain: ['create', 'builds a container'], generated: false, id: 0 }] }`) so the stated block renders its count, and assert `toContain('<span className="nexus-api-entry__states-count-value">1</span> behaviour')`.

In `apps/docs/tools/loader-chain.test.mjs`, add a case that the reference loader entry's options equal `referenceOptions` with `root`.

- [ ] **Step 2: Run them and watch them fail.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-examples-reference && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/docs -- loader-chain`
      Expected: FAIL on the kind class, the missing option and the `<Figure>`.

- [ ] **Step 3: Implement.**
  - `reference-options.mjs`:

```js
/**
 * The class prefixes the reference loader writes (spec section 22, item 3).
 *
 * `classPrefix` names the entry's own elements, which `components/api/entry.css`
 * styles. `kindPrefix` names the kind class, which `@nexusdi/meridian-ui`
 * generates with `--meridian-kind` bound. The loader chain, the `.md` siblings
 * and the repo-checks loaders read this one object, so the three cannot disagree.
 */
export const referenceOptions = Object.freeze({
  classPrefix: 'nexus',
  kindPrefix: 'meridian',
});
```

- `reference-options.d.mts`: `export declare const referenceOptions: Readonly<{ classPrefix: 'nexus'; kindPrefix: 'meridian' }>;`
- Loader: rename `assertClassPrefix(prefix)` to `assertPrefix(name, value)` and call it for both options; thread `kindPrefix` to the entry wrapper (`${kindPrefix}-kind-${kindSlug(reference.kind)}`); in `statedBlock` replace `<Figure>${stated}</Figure>` with `<span className="${prefix}-api-entry__states-count-value">${stated}</span>`; read `kindPrefix` in the default export from `this.getOptions()`. Update the `.d.mts` types (`kindPrefix: string` in `ExpandReferencesOptions` and in `getOptions()`).
- `loader-chain.mjs`: `options: { root: workspaceRoot, ...referenceOptions }`.
- `apps/docs/tools/md-siblings.mjs`: pass `referenceOptions`.
- `tools/repo-checks/src/docs/loaders.ts`: `MdSiblings` options type becomes `{ classPrefix: string; kindPrefix: string }`; every caller passes the object imported from `apps/docs/tools/reference-options.mjs` through the same computed-specifier `load` the file uses.

- [ ] **Step 4: Run the tests.** Same commands. Expected: PASS.

- [ ] **Step 5: Run the task gate.**

- [ ] **Step 6: Commit.**

```bash
git add apps/docs/tools tools/doc-examples tools/repo-checks
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(doc-examples): emit the meridian kind class and a plain behaviour count" -m "The kind class takes its own prefix, so a reference entry binds --meridian-kind through the class meridian-ui generates. The count renders as a span because <Figure> on this site is the benchmark figure. One options module feeds the loader chain, the .md siblings and the repo checks."
```

### Task 4: Compile every twoslash fence in the site's environment

Every reference entry emits two `twoslash` fences. Under Nextra's defaults a fence that calls `console.log` fails with TS2584 (measured), and the Playground's compiler options do not exist yet (spec section 22, items 5 and 6).

**Files:**

- Create: `apps/docs/components/runtime/compiler-options.ts`, `apps/docs/components/runtime/runtime-globals.d.ts`
- Create: `apps/docs/tools/mdx-twoslash-prelude.mjs`, `apps/docs/tools/mdx-twoslash-prelude.test.mjs`
- Modify: `apps/docs/tools/loader-chain.mjs`, `apps/docs/tools/loader-chain.test.mjs`
- Create: `tools/repo-checks/src/doc-twoslash.test.ts`

**Interfaces:**

- Produces: `compilerOptions` (`target: 'es2022'`, `module: 'esnext'`, `moduleResolution: 'bundler'`, `strict: true`, `lib: ['es2023', 'esnext.disposable']`) and `RUNTIME_GLOBALS_FILE` (the absolute path of `runtime-globals.d.ts`) from `compiler-options.ts`.
- Produces: `withPrelude(code: string): string` and the default loader export from `mdx-twoslash-prelude.mjs`. `withPrelude` returns the option lines, a `// @filename: runtime-globals.d.ts` block, `// @filename: example.ts`, `// ---cut---` and the fence's code.

- [ ] **Step 1: Write the failing tests.** `mdx-twoslash-prelude.test.mjs`:

````js
// @vitest-environment node
import { createTwoslasher } from 'twoslash';
import { describe, expect, it } from 'vitest';

import loader, { withPrelude } from './mdx-twoslash-prelude.mjs';

const fence = '```';
const call = (source) =>
  loader.call(
    { getOptions: () => ({}), addDependency() {}, resourcePath: 'x.mdx' },
    source,
  );

describe('the twoslash prelude', () => {
  it('compiles a fence that awaits a container and logs', () => {
    const code = [
      "import { Nexus, Token, defineModule, provide } from '@nexusdi/core';",
      'interface IReactor { on(): boolean }',
      "const REACTOR = new Token<IReactor>('Reactor');",
      "await using ship = await Nexus.create(defineModule({ name: 'Engineering', providers: [provide(REACTOR, { useValue: { on: () => true } })] }));",
      'console.log(ship.get(REACTOR).on());',
    ].join('\n');
    const result = createTwoslasher()(withPrelude(code), 'ts');
    expect(result.code.trim()).toBe(code);
  });

  it('prepends to a twoslash fence and leaves every other fence alone', () => {
    const source = [
      `${fence}ts twoslash`,
      'const a = 1;',
      fence,
      '',
      `${fence}ts`,
      'const b = 2;',
      fence,
    ].join('\n');
    const out = call(source);
    expect(out).toContain('// @lib: es2023,esnext.disposable');
    expect(out.match(/---cut---/g)).toHaveLength(1);
    expect(out).toContain(`${fence}ts\nconst b = 2;\n${fence}`);
  });

  it('keeps a fence that already cuts its own preamble', () => {
    const code =
      "import { Token } from '@nexusdi/core';\nconst PRE = 1;\n// ---cut---\nconst T = new Token<string>('T');\nconsole.log(T, PRE);";
    expect(createTwoslasher()(withPrelude(code), 'ts').code.trim()).toBe(
      "const T = new Token<string>('T');\nconsole.log(T, PRE);",
    );
  });
});
````

Add to `loader-chain.test.mjs`: the first entry is `mdx-twoslash-prelude.mjs`, and a run of the whole chain over a page with a `<!-- reference … -->` directive (stub the reference loader's `read` is not possible through the chain, so use a page with a `ts twoslash` fence and assert the prelude reached it after the region loader filled a `file=… region=…` fence: write a fixture README with a region into a temp root and cite it with ` ```ts twoslash file=libs/x/README.md region=r `).

Port `tools/repo-checks/src/doc-twoslash.test.ts` from libraries (`git … show 92320250:tools/repo-checks/src/doc-twoslash.test.ts`) with these changes: `@evanion` to `@nexusdi`; read pages through `readExpandedSite(CONTENT)` and, for pages with directives, through `loadMdSiblings()` with `referenceOptions` (so reference fences are compiled); compile each fence as `withPrelude(code)` imported from `apps/docs/tools/mdx-twoslash-prelude.mjs`; `markdownFiles(packageDir)` reads `README.md` and every `docs/*.md` of each `libs/*` package from Task 6's library list (until Task 6, inline the same `libs/*/package.json` read). Keep its `@errors` both-directions rule and the `^?`-last-line rule.

- [ ] **Step 2: Run them and watch them fail.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/docs -- twoslash-prelude loader-chain && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-twoslash`
      Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement.**
  - `compiler-options.ts`:

```ts
import { join } from 'node:path';

/**
 * The one TypeScript environment the site compiles examples in (spec section
 * 11.2). The twoslash prelude reads it now; the Playground worker reads it when
 * it arrives. No `dom` lib (section 11.3): `runtime-globals.d.ts` declares the
 * globals an example may use.
 */
export const compilerOptions = {
  target: 'es2022',
  module: 'esnext',
  moduleResolution: 'bundler',
  strict: true,
  lib: ['es2023', 'esnext.disposable'],
} as const;

export const RUNTIME_GLOBALS_FILE = join(
  import.meta.dirname,
  'runtime-globals.d.ts',
);
```

- `runtime-globals.d.ts`: declare `console` (`log`, `info`, `warn`, `error`, `debug`, `table`, each `(...data: unknown[]): void`), `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `queueMicrotask` and `performance.now()` with the signatures of TypeScript's `lib.dom.d.ts`, minus the DOM types they reference.
- `mdx-twoslash-prelude.mjs`: read `compiler-options.ts` with `import { compilerOptions, RUNTIME_GLOBALS_FILE } from '../components/runtime/compiler-options.ts'` (Node runs `.ts` under type stripping, as `next.config.ts` already relies on for `app/channel.ts`); `withPrelude(code)` writes `// @target: es2022`, `// @module: esnext`, `// @moduleResolution: bundler`, `// @strict: true`, `// @lib: es2023,esnext.disposable` (built from `compilerOptions`, never typed by hand), `// @filename: runtime-globals.d.ts`, the file's contents, `// @filename: example.ts`, `// ---cut---`, then `code`. The loader scans lines for a fence opener whose info string is exactly `ts twoslash` or `tsx twoslash`, and passes every other line through; it calls `this.addDependency` for both runtime files.
- `loader-chain.mjs`: put `{ loader: tool('mdx-twoslash-prelude.mjs') }` first and update the doc comment: the list runs from last to first, so the prelude runs last.

- [ ] **Step 4: Run the tests.** Same commands. Expected: PASS. `doc-twoslash` finds no `twoslash` fence on a content page yet and compiles the package markdown fences; if a package fence fails, fix the fence in `libs/<pkg>/docs/*.md` (it is a doctest, so run `npx nx test <pkg>` too).

- [ ] **Step 5: Run the task gate.**

- [ ] **Step 6: Commit.**

```bash
git add apps/docs/components/runtime apps/docs/tools tools/repo-checks/src/doc-twoslash.test.ts
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(docs): compile twoslash fences with the site's compiler options" -m "The prelude runs last in the loader chain and prepends the options and the runtime globals to every twoslash fence, so a reference entry compiles in the environment the Playground will use. doc-twoslash compiles every content fence and every package markdown fence under it. Guard ported from Evanion/libraries@92320250."
```

### Task 5: Add `Chip` to the design system

The loader emits `<Chip>` beside each export name, and the filter's kind toggles share its geometry.

**Files:**

- Create: `internal/meridian-ui/src/components/chip.tsx`
- Modify: `internal/meridian-ui/src/index.ts`, `internal/meridian-ui/src/styles.css`, `internal/meridian-ui/src/components/components.test.tsx`

**Interfaces:**

- Produces: `Chip({ children, className? }: ChipProps)` rendering `<span className="meridian-chip …">`; `ChipProps`.

- [ ] **Step 1: Write the failing test** in `components.test.tsx`:

```tsx
describe('Chip', () => {
  it('renders a span with the chip class and keeps the caller class', () => {
    const { container } = render(<Chip className="x">function</Chip>);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.tagName).toBe('SPAN');
    expect(chip.className).toBe('meridian-chip x');
    expect(chip.textContent).toBe('function');
  });
});
```

Import `Chip` from `../index.js` beside the others.

- [ ] **Step 2: Run it.** `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-ui`. Expected: FAIL, `Chip` is not exported.

- [ ] **Step 3: Implement.**

```tsx
import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface ChipProps {
  children?: ReactNode;
  className?: string;
}

/** A small label in the mono micro face. It says a fact in words, so colour is never its only channel. */
export function Chip({ children, className }: ChipProps) {
  return <span className={cx('meridian-chip', className)}>{children}</span>;
}
```

Export `Chip` and `ChipProps` from `index.ts`. Add to `styles.css`:

```css
.meridian-chip {
  display: inline-block;
  padding: 0 var(--meridian-space-2);
  border: 1px solid var(--meridian-rule);
  border-radius: var(--meridian-radius-chip);
  color: var(--meridian-text-secondary);
  font-family: var(--meridian-font-mono);
  font-size: var(--meridian-text-micro);
  line-height: var(--meridian-leading-micro);
  letter-spacing: var(--meridian-tracking-micro);
}

[class*='meridian-kind-'] .meridian-chip {
  color: var(--meridian-kind);
  border-color: color-mix(in oklab, var(--meridian-kind) 45%, transparent);
}
```

`styles.test.ts` already refuses a literal colour; run it.

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS, `react-imports.test.ts` included.

- [ ] **Step 5: Run the task gate.**

- [ ] **Step 6: Commit.**

```bash
git add internal/meridian-ui/src
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(meridian-ui): add the chip"
```

### Task 6: Write what each package's tests state

**Files:**

- Create: `apps/docs/tools/libraries.mjs`, `apps/docs/tools/libraries.d.mts`, `apps/docs/tools/libraries.test.mjs`
- Create: `apps/docs/tools/behaviour-data.mjs`
- Modify: `apps/docs/package.json` (target, dependencies), `tools/repo-checks/package.json` (test `dependsOn`)
- Modify: `tools/repo-checks/src/doc-behaviour-render.test.ts` (the stated-block and sidecar blocks)

**Interfaces:**

- Consumes: `behavioursOf(root)` with `offsets` (Task 1).
- Produces: `libraries(workspaceRoot: string): { name: string; root: string; dir: string }[]`, sorted by `dir`, one per `libs/*` package whose `exports` keys include anything but `./package.json`.
- Produces: `apps/docs/components/api/behaviour/<dir>.json` (`{ package, files, states }`, the `StatedFile` type) `apps/docs/components/api/behaviour/code-classes.css` (the `sh-*` rules), and `apps/docs/public/behaviour/<dir>/<name>.json`, one per stated identifier whose rail lists a case, written by `sidecarsOf` in `apps/docs/tools/sidecars.mjs` (`{ package, name, bodies: Record<id, { where, line, html }>, popups: Record<string, string> }`, the popups being those the bodies point at).

- [ ] **Step 1: Write the failing tests.** `libraries.test.mjs`:

```js
// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { libraries } from './libraries.mjs';

const pkg = (root, dir, json) => {
  mkdirSync(join(root, 'libs', dir), { recursive: true });
  writeFileSync(join(root, 'libs', dir, 'package.json'), JSON.stringify(json));
};

describe('libraries', () => {
  it('lists every package with a library entry, and no bin-only package', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexusdi-libraries-'));
    pkg(root, 'core', {
      name: '@nexusdi/core',
      exports: { '.': './dist/index.js', './package.json': './package.json' },
    });
    pkg(root, 'cli', {
      name: '@nexusdi/cli',
      bin: { nexusdi: './dist/bin.js' },
      exports: { './package.json': './package.json' },
    });
    expect(libraries(root)).toEqual([
      { name: '@nexusdi/core', root: 'libs/core', dir: 'core' },
    ]);
  });

  it('lists the workspace as it stands', () => {
    expect(
      libraries(join(import.meta.dirname, '../../..')).map((each) => each.dir),
    ).toEqual([
      'core',
      'decorators',
      'devtools',
      'errors',
      'federation',
      'interceptors',
      'node',
      'testing',
    ]);
  });
});
```

Port the libraries `doc-behaviour-render.test.ts` blocks `the block an entry carries` (lines 177 to 266) and `the cases a catalogue opens` (lines 267 to 346) into the Task 1 file, with `@evanion/acl` cases rewritten against `@nexusdi/testing`'s `createTestingContainer`, classes `docs-api-entry` changed to `nexus-api-entry`, and the last case replaced by:

```ts
it('colours every highlighted token through the shiki theme variables', () => {
  for (const name of libraries()) {
    const sidecar = read<Sidecar>(sidecars, name);
    const html = Object.values(sidecar.bodies)
      .map((body) => body.html)
      .join('');
    expect(html).toMatch(/--shiki-light:/);
    expect(html).toMatch(/--shiki-dark:/);
    expect(html).not.toMatch(/style="color:/);
  }
});
```

- [ ] **Step 2: Run them and watch them fail.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/docs -- libraries && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-behaviour-render`
      Expected: FAIL, `libraries.mjs` does not exist and `components/api/behaviour` is missing.

- [ ] **Step 3: Implement `libraries.mjs`.**

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The packages that publish a library entry, read from their package files
 * (spec section 22, item 7). A package joins by publishing one, so a new
 * package needs no edit here, and `@nexusdi/cli`, which publishes a bin only,
 * stays out.
 */
export function libraries(workspaceRoot) {
  const libs = join(workspaceRoot, 'libs');
  return readdirSync(libs)
    .filter((dir) => existsSync(join(libs, dir, 'package.json')))
    .map((dir) => ({
      dir,
      json: JSON.parse(readFileSync(join(libs, dir, 'package.json'), 'utf8')),
    }))
    .filter(({ json }) =>
      Object.keys(json.exports ?? {}).some((key) => key !== './package.json'),
    )
    .map(({ dir, json }) => ({ name: json.name, root: `libs/${dir}`, dir }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}
```

`libraries.d.mts` declares it.

- [ ] **Step 4: Port `behaviour-data.mjs`.** Copy the libraries file and change:
  - imports: `@nexusdi/doc-examples/behaviours`; `import { codeClasses, stylesheet, THEMES } from './code-classes.mjs'`; `import { statedBy } from '@nexusdi/doc-examples/mdx-reference-loader'`; `import { libraries } from './libraries.mjs'`.
  - `COMPILER.customConditions: ['@nexusdi/source']`; comments naming `@evanion/acl` facts are rewritten for this repository or removed, so no number from the libraries suite stays.
  - `highlight`: `themes: { light: 'github-light', dark: 'github-dark' }`, `defaultColor: false`, `transformers: [...twoslash]`. Add a comment that these are Nextra's own themes (`nextra/dist/server/rehype-plugins/rehype.js`), so a case and a page fence share colours.
  - `const projects = libraries(workspaceRoot)` (synchronous), and `name: project.dir` in `filesFor`.
  - Leave the two log lines; they print what was written.
- [ ] **Step 5: Wire the target.** In `apps/docs/package.json` under `nx.targets`:

```json
"behaviour-data": {
  "command": "node tools/behaviour-data.mjs",
  "options": { "cwd": "{projectRoot}" },
  "cache": true,
  "dependsOn": ["^build"],
  "inputs": [
    "{projectRoot}/tools/behaviour-data.mjs",
    "{projectRoot}/tools/libraries.mjs",
    "{workspaceRoot}/tools/doc-examples/src/behaviours.mjs",
    "{workspaceRoot}/libs/*/package.json",
    "{workspaceRoot}/libs/*/src/**/*.ts",
    "{workspaceRoot}/libs/*/src/**/*.tsx"
  ],
  "outputs": ["{projectRoot}/components/api/behaviour", "{projectRoot}/public/behaviour"]
}
```

Add `"behaviour-data"` to `dependsOn` of `build` and `typecheck`. Add `"shiki": "3.23.0"`, `"@shikijs/twoslash": "3.23.0"` and `"twoslash": "0.3.9"` to `devDependencies` (the versions Nextra 4.6.1 installs; check with `node -p "require('shiki/package.json').version"`), then `npm install`. In `tools/repo-checks/package.json`, add `"dependsOn": ["@nexusdi/docs:behaviour-data"]` to the `test` target. The `.gitignore` entries already exist (`apps/docs/.gitignore`).

- [ ] **Step 6: Run the target and the tests.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/docs:behaviour-data` then both test commands of Step 2.
      Expected: the target prints one index count and one sidecar size line, eight index files exist, and the tests PASS. A file whose compile fails prints a warning and its cases carry no types; record each warning in the ledger and fix any that comes from a missing compiler option.

- [ ] **Step 7: Run the task gate.**

- [ ] **Step 8: Commit.**

```bash
git add apps/docs/tools apps/docs/package.json package-lock.json tools/repo-checks
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(docs): write what each package's tests state" -m "docs:behaviour-data reads every library's test sources into an index the reference loader reads and a highlighted sidecar the catalogue fetches. The library list comes from each package's exports map. Ported from Evanion/libraries@92320250 with Nextra's shiki themes."
```

### Task 7: Hold every stated sentence against a run

**Files:**

- Modify: `libs/cli/vite.config.ts`, `libs/core/vite.config.ts`, `libs/decorators/vite.config.ts`, `libs/devtools/vite.config.ts`, `libs/errors/vite.config.ts`, `libs/federation/vite.config.ts`, `libs/interceptors/vite.config.ts`, `libs/node/vite.config.ts`, `libs/testing/vite.config.ts`
- Modify: `tools/repo-checks/package.json` (test `dependsOn`)
- Create: `tools/repo-checks/src/doc-behaviour-run.test.ts`

**Interfaces:**

- Produces: `libs/<dir>/test-output/vitest/coverage/report.json` after every `nx test <pkg>`.

- [ ] **Step 1: Write the failing test.** Port the libraries `doc-behaviour-run.test.ts` with `@evanion/acl` replaced by `@nexusdi/core` in `finds a data file for every released library`, and add a sabotage case:

```ts
it('names a sentence no case of that name ran', () => {
  const behaviours = {
    package: '@nexusdi/node',
    files: [],
    states: {
      nodeScopes: [
        {
          chain: ['nodeScopes', 'a case nobody wrote'],
          generated: false,
          id: 0,
        },
      ],
    },
  };
  expect(failuresOf('node', behaviours)).toEqual([
    expect.stringContaining('"nodeScopes > a case nobody wrote"'),
  ]);
});
```

Extract the body of the `it.each` into `function failuresOf(directory: string, behaviours: Behaviours): string[]` so both tests call it.

- [ ] **Step 2: Run it.** `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-behaviour-run`. Expected: FAIL, no `report.json` exists.

- [ ] **Step 3: Implement.** In each `libs/*/vite.config.ts`, change `reporters: ['default']` to:

```ts
reporters: [
  'default',
  // doc-behaviour-run.test.ts holds every sentence a reference entry renders
  // against this report. It sits inside the test target's cached output.
  ['json', { outputFile: './test-output/vitest/coverage/report.json' }],
],
```

Check that each lib's inferred `test` target lists `{projectRoot}/test-output/vitest/coverage` in its outputs (`npx nx show project @nexusdi/core --json | jq '.targets.test.outputs'`); add it in the package's `nx.targets.test.outputs` where it does not. Then make the repo-checks test wait for each library's test: `"dependsOn": ["@nexusdi/docs:behaviour-data", { "projects": ["@nexusdi/core", "@nexusdi/decorators", "@nexusdi/devtools", "@nexusdi/errors", "@nexusdi/federation", "@nexusdi/interceptors", "@nexusdi/node", "@nexusdi/testing"], "target": "test" }]`. Nx task-level `dependsOn` takes this object form; check `nx_docs` "dependsOn projects" if the schema has moved. A new library adds its name to this list in the pull request that adds it, and the test's `finds a data file for every released library` compares the list to `libraries()` so a missing name fails.

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Run the task gate** with `--projects` extended by every `libs/*` project.

- [ ] **Step 6: Commit.**

```bash
git add libs/*/vite.config.ts libs/*/package.json tools/repo-checks
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(repo): hold every stated sentence against the package's run" -m "Each library writes Vitest's json report inside its cached test output, and doc-behaviour-run fails a sentence the data carries that no case ran. Ported from Evanion/libraries@92320250."
```

### Task 8: Give every callable export a `describe` (G11)

**Files:**

- Create: `tools/repo-checks/src/doc-behaviour.test.ts`
- Modify: `libs/core/src/definitions/` test file holding `moduleDefinitionOf`'s cases (find with `grep -rn "moduleDefinitionOf" libs/core/src --include=*.test.ts`), `libs/core/src/text/` test file holding `layoutText`'s cases, `libs/interceptors/src/` test file holding `interceptors()`'s top-level cases.

**Interfaces:**

- Consumes: `readPackageExports` (`tools/repo-checks/src/docs/package-exports.ts`), `describedBy`, `behavioursOf`, `libraries()` (Task 6).

- [ ] **Step 1: Write the failing test.** Port the libraries `doc-behaviour.test.ts` with: export lists from `readPackageExports(join(workspaceRoot, item.root, 'package.json'))`; packages from `libraries(workspaceRoot)`; no `declarer` (attribute every name to its own package, say in the comment that no NexusDI package re-exports another's callable, and add `declares every callable export inside its own package`, which reads `readDeclarationFiles`); `testFilesOf` keeps leaving out `libs/core/src/security`, which the comment names, and the guard carries no `reads no title from the adversarial suite` case; add `reaches no unexported src name from a case on an export's rail`, with an inline `HELPERS` allowlist that starts empty; `ACCEPTED` an empty object with the comment kept on why it is inline. Keep `gives every non-error callable export a describe naming it`, `nests no describe naming an export inside one naming another` and `accepts no name that is stated after all`.

- [ ] **Step 2: Run it.** `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-behaviour.test`. Expected: FAIL naming `@nexusdi/core: moduleDefinitionOf`, `@nexusdi/core: layoutText` and `@nexusdi/interceptors: interceptors`.

- [ ] **Step 3: Rename or wrap.** For each of the three, find the cases that exercise it and put them under `describe('<name>', () => { … })`, moving no assertion. Where no case exercises it, write one that states its behaviour, test-first in its package (`npx nx test @nexusdi/core`), reading the implementation to state what it does. Keep test titles in the present tense (`test-title-mood.test.ts`).

- [ ] **Step 4: Run the guard and the packages.** `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test --projects=@nexusdi/core,@nexusdi/interceptors,@nexusdi/repo-checks`. Expected: PASS.

- [ ] **Step 4b: Limit the sidecars to exported names.** `sidecarsOf` (`apps/docs/tools/sidecars.mjs`) writes a sidecar for every stated identifier, so 66 of `@nexusdi/core`'s 84 sidecars name an internal `describe` (`buildView`, `construct`) and no export. Give `behaviour-data.mjs` each library's export names from the `readPackageExports` logic of `tools/repo-checks/src/docs/package-exports.ts` (move the reading into an `.mjs` module both import, since `apps/docs/tools` runs under plain Node), and pass them to `sidecarsOf`, which writes a sidecar only for a name in the list. In `doc-behaviour-render.test.ts`, rename `writes one sidecar per stated identifier of %s whose rail lists a case` to `writes one sidecar per export of %s whose rail lists a case` and compare the files against the package's export list, filtered by `statedBy(...).stated > 0`, in place of the identifier filter. Update spec section 22 item 7's "per stated identifier" to "per export" in the same commit.

- [ ] **Step 5: Run the task gate** with `@nexusdi/core,@nexusdi/interceptors` added.

- [ ] **Step 6: Commit** in two commits: `test(core): name moduledefinitionof and layouttext in their describe blocks` and `test(interceptors): name interceptors in its describe block` for the package changes, then `test(repo): require a describe for every callable export` with the guard and the libraries attribution line.

### Task 9: The filter, the catalogue and the entry styles

**Files:**

- Create: `apps/docs/components/api/ApiFilter.tsx`, `api.css`, `ApiFilter.test.tsx`
- Create: `apps/docs/components/api/BehaviourCatalogue.tsx`, `behaviour.css`, `BehaviourCatalogue.test.tsx`
- Create: `apps/docs/components/api/entry.css`, `apps/docs/components/api/stylesheets.test.ts`
- Modify: `apps/docs/mdx-components.js`, `apps/docs/next.config.ts`

**Interfaces:**

- Consumes: `Chip`, `ConsoleFrame`, `Marker` from `@nexusdi/meridian-ui`; the markup of Task 3; the sidecar of Task 6.
- Produces: MDX tags `ApiFilter` (no props), `BehaviourCatalogue` (`library`, `name`, `groups`), `Chip`.

- [ ] **Step 1: Write the failing tests.**
  - `BehaviourCatalogue.test.tsx`: port the libraries test with `docs-behaviours` to `nexus-behaviours`, plus:

```tsx
it('fetches the sidecar under the base path', async () => {
  vi.stubEnv('NEXUS_BASE_PATH', '/next');
  const fetched = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          package: '@nexusdi/node',
          name: 'nodeScopes',
          bodies: {},
          popups: {},
        }),
      ),
  );
  vi.stubGlobal('fetch', fetched);
  render(
    <BehaviourCatalogue
      library="node"
      name="nodeScopes"
      groups={[
        {
          label: 'nodeScopes',
          rows: [{ title: 'keeps two runs apart', id: 0 }],
        },
      ]}
    />,
  );
  intersect();
  await waitFor(() =>
    expect(fetched).toHaveBeenCalledWith(
      '/next/behaviour/node/nodeScopes.json',
    ),
  );
});

it('titles the pane with the file and line of the case', async () => {
  serve({
    bodies: {
      '0': {
        where: 'libs/node/src/index.test.ts',
        line: 12,
        html: '<span>x</span>',
      },
    },
    popups: {},
  });
  render(
    <BehaviourCatalogue
      library="node"
      name="nodeScopes"
      groups={[
        {
          label: 'nodeScopes',
          rows: [{ title: 'keeps two runs apart', id: 0 }],
        },
      ]}
    />,
  );
  intersect();
  expect(
    await screen.findByRole('region', {
      name: 'libs/node/src/index.test.ts:12',
    }),
  ).toBeInTheDocument();
});
```

`intersect` and `serve` are the helpers the libraries test defines (an `IntersectionObserver` stub that fires and a `fetch` stub); keep them. `ConsoleFrame` renders a `section` with `aria-label`, which is the `region` role.

- `ApiFilter.test.tsx`:

```tsx
const page = () =>
  render(
    <main>
      <ApiFilter />
      <div className="nexus-api-entry meridian-kind-function">
        <h2>graph</h2>
      </div>
      <div className="nexus-api-entry meridian-kind-interface">
        <h2>GraphView</h2>
      </div>
      <div className="nexus-api-entry meridian-kind-function">
        <h2>trace</h2>
      </div>
    </main>,
  );
const entries = () =>
  [...document.querySelectorAll('.nexus-api-entry')] as HTMLElement[];

it('hides what does not match and removes nothing', async () => {
  page();
  await userEvent.type(screen.getByRole('searchbox'), 'graph');
  expect(entries()).toHaveLength(3);
  expect(entries().map((each) => each.hidden)).toEqual([false, false, true]);
  expect(screen.getByText('2 of 3')).toBeInTheDocument();
});

it('turns a kind off and clears everything with Escape and the button', async () => {
  page();
  await userEvent.click(screen.getByRole('button', { name: 'interface' }));
  expect(entries()[1]?.hidden).toBe(true);
  await userEvent.type(screen.getByRole('searchbox'), 'zzz');
  expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear the filter' }),
  );
  expect(entries().every((each) => !each.hidden)).toBe(true);
});

it('renders hidden until it has read the page', () => {
  const html = renderToString(<ApiFilter />);
  expect(html).toContain('hidden');
});
```

Add `@testing-library/user-event` 14.6.1 to `apps/docs` devDependencies if it is absent.

- `stylesheets.test.ts` reads the three sheets and asserts: no literal colour (`/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i` finds nothing outside `color-mix(… transparent)`), every `var(--…)` names a `--meridian-*`, `--shiki-*` or `--nextra-*` property, and `behaviour.css` holds both `var(--shiki-light)` and `html.dark` with `var(--shiki-dark)`.

- [ ] **Step 2: Run them.** `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/docs -- components/api`. Expected: FAIL, nothing exists.

- [ ] **Step 3: Port `ApiFilter.tsx`.** Copy the libraries file and change: `import './api.css'` stays; `.docs-api-entry` to `.nexus-api-entry`; the kind regex to `/^meridian-kind-(.+)$/`; class names `docs-api-filter…` to `nexus-api-filter…`; the toggle's classes to `meridian-chip nexus-api-filter__kind meridian-kind-${kind}`; the doc comment's `/acl/api/` facts to "a reference page". Convert its two bold-led comment paragraphs to plain sentences, since comments carry no bold lead-ins.

- [ ] **Step 4: Port `BehaviourCatalogue.tsx`.** Copy the libraries file and change:
  - `load(library, name)`: ``fetch(`${process.env.NEXUS_BASE_PATH ?? ''}/behaviour/${library}/${name}.json`)``, cached per library and name, with a comment that `/next/` serves the sidecar under its base path and that a sidecar holds one export's cases.
  - `import './behaviour/code-classes.css'`, the `sh-*` rules `docs:behaviour-data` writes, beside `import './behaviour.css'`.
  - The pane: wrap it in `<ConsoleFrame title={body ? `${body.where}:${body.line}` : 'Test case'}>` and put `<Marker shape="corner" />` before the sentence; delete the separate `__where` paragraph, since the frame's title carries it.
  - The pane sits after the listbox in both layouts and the rail names it with `aria-controls`; below `48rem` it stacks under the rail. Drop the libraries `useNarrow` tree, which put the pane inside the listbox under the selected row.
  - `docs-behaviours` to `nexus-behaviours` throughout.
  - Comments: the `@evanion/acl` measurements go; the bold paragraphs become plain sentences.
- [ ] **Step 5: Write the sheets.** `api.css`:

```css
/*
 * The filter above an API page's entries. Sticky under the navbar, on the
 * raised hull, with the cyan edge the release notice uses, so a reader
 * scrolling a hundred entries keeps the control in reach.
 */
.nexus-api-filter {
  position: sticky;
  top: var(--nextra-navbar-height);
  z-index: 1;
  margin-block-end: var(--meridian-space-5);
  padding: var(--meridian-space-3) var(--meridian-space-4);
  border-inline-start: 2px solid var(--meridian-signal-cyan);
  border-radius: var(--meridian-radius-chip);
  background: var(--meridian-hull-raised);
  box-shadow: var(--meridian-elevation-raised);
}

.nexus-api-filter__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--meridian-space-2);
}

.nexus-api-filter__query {
  flex: 1 1 12rem;
  min-inline-size: 0;
  padding: var(--meridian-space-2) var(--meridian-space-3);
  border: 1px solid var(--meridian-control-border);
  border-radius: var(--meridian-radius-control);
  background: var(--meridian-hull);
  color: var(--meridian-text);
  font: inherit;
}

.nexus-api-filter__kind {
  cursor: pointer;
  background: transparent;
}

.nexus-api-filter__kind[aria-pressed='false'] {
  color: var(--meridian-text-tertiary);
  border-color: var(--meridian-rule);
}

.nexus-api-filter__count {
  margin-inline-start: auto;
  color: var(--meridian-text-secondary);
  font-family: var(--meridian-font-mono);
  font-size: var(--meridian-text-micro);
  font-variant-numeric: tabular-nums;
}

.nexus-api-filter__empty {
  margin: var(--meridian-space-3) 0 0;
  color: var(--meridian-text-secondary);
}

.nexus-api-filter__clear {
  padding: 0;
  border: 0;
  background: none;
  color: var(--meridian-signal-cyan);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
```

`entry.css`:

```css
/*
 * An API entry: a list item on the article's hull, separated by a hairline.
 * The name takes the kind's hue and the chip beside it says the kind in words.
 */
.nexus-api-entry {
  margin-block-start: var(--meridian-space-6);
  padding-block: var(--meridian-space-4) var(--meridian-space-5);
  border-block-start: 1px solid var(--meridian-rule);
}

.nexus-api-entry__name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--meridian-space-3);
}

.nexus-api-entry :where(h2) {
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--meridian-kind);
  overflow-wrap: anywhere;
  scroll-margin-top: calc(var(--nextra-navbar-height) + 5rem);
}

.nexus-api-entry h2 code {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font-family: var(--meridian-font-display);
}

.nexus-api-entry__signature :where(pre),
.nexus-api-entry__signature :where(pre) :where(code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nexus-api-entry__more :where(summary) {
  color: var(--meridian-text-secondary);
  font-size: var(--meridian-text-small);
}

.nexus-api-entry__states {
  margin-block-start: var(--meridian-space-4);
  padding-inline-start: var(--meridian-space-4);
  border-inline-start: 1px solid
    color-mix(in oklab, var(--meridian-kind) 45%, transparent);
}

.nexus-api-entry__states-head {
  display: flex;
  align-items: baseline;
  gap: var(--meridian-space-3);
  padding-block-end: var(--meridian-space-2);
  border-block-end: 1px solid var(--meridian-rule);
}

.nexus-api-entry__states-heading {
  margin: 0;
  color: var(--meridian-text);
  font-family: var(--meridian-font-display);
  font-size: var(--meridian-text-small);
}

.nexus-api-entry__states-count {
  margin: 0 0 0 auto;
  color: var(--meridian-text-secondary);
  font-family: var(--meridian-font-mono);
  font-size: var(--meridian-text-micro);
}

.nexus-api-entry__states-count-value {
  font-variant-numeric: tabular-nums;
}

.nexus-api-entry__states-note,
.nexus-api-entry__states-silence {
  margin: var(--meridian-space-3) 0 0;
  color: var(--meridian-text-tertiary);
  font-size: var(--meridian-text-small);
}

.nexus-api-entry__states--silent {
  border-inline-start-style: dashed;
}
```

`behaviour.css`: copy the libraries file and map every property. `--baize-space-N` to `--meridian-space-N`; `--baize-text-sm` to `--meridian-text-small`; `--baize-text-xs` to `--meridian-text-micro`; `--baize-text-base` to `--meridian-text-body`; `--baize-font-text` to `--meridian-font-body`; `--baize-font-title` to `--meridian-font-display`; `--font-mono` to `--meridian-font-mono`; `--baize-chalk` to `--meridian-text`; `--baize-lichen` to `--meridian-text-secondary`; `--baize-moss` to `--meridian-text-tertiary`; `--baize-rule` to `--meridian-rule`; `--baize-felt` and `--baize-ink` to `--meridian-hull-raised`; `--baize-kind` to `--meridian-kind`; `--baize-radius-button` to `--meridian-radius-control`; `--baize-radius-card` to `--meridian-radius-panel`; `--baize-leading-normal` to `--meridian-leading-body`; `--baize-leading-tight` to `--meridian-leading-small`; `--baize-tracking-loose` to `--meridian-tracking-micro`. Delete the rules that styled the old `__where` paragraph. Beside `color: var(--shiki-light)` and `color: var(--shiki-dark)`, map `font-weight: var(--shiki-light-font-weight)` and `font-weight: var(--shiki-dark-font-weight)`, and the same for `font-style`: a bold or italic token keeps an inline style carrying those variables, since `code-classes.css` holds colour pairs only. Add:

```css
.nexus-behaviours .meridian-console__title {
  text-transform: none;
  overflow-wrap: anywhere;
}

.nexus-behaviours__body {
  overflow-x: auto;
  max-inline-size: 100%;
}

.nexus-behaviours__body span {
  color: var(--shiki-light);
}

html.dark .nexus-behaviours__body span {
  color: var(--shiki-dark);
}

@media (prefers-reduced-motion: reduce) {
  .nexus-behaviours * {
    transition: none;
  }
}
```

The selected rail row uses `--meridian-kind` for its marker and `--meridian-hull` for its ground; the type card uses `--meridian-hull-raised` and `--meridian-elevation-raised`, so `surfaces.spec.ts` sees an opaque surface under its text.

- [ ] **Step 6: Register.** `mdx-components.js`: import `Chip` from `@nexusdi/meridian-ui`, `ApiFilter` and `BehaviourCatalogue` from `./components/api/…`, and `./components/api/entry.css`; add the three to the map, each with a one-line comment saying who writes the tag (the author writes `<ApiFilter />`; the reference loader writes the other two). `next.config.ts`: add `env: { NEXUS_BASE_PATH: readBasePath() }` with a comment that the catalogue fetches its sidecar under the base path.

- [ ] **Step 7: Run the tests.** Same command as Step 2. Expected: PASS.

- [ ] **Step 8: Run the task gate.** No page mounts these yet; the build proves they compile.

- [ ] **Step 9: Commit.**

```bash
git add apps/docs/components/api apps/docs/mdx-components.js apps/docs/next.config.ts apps/docs/package.json package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(docs): add the api filter, the behaviour catalogue and the entry styles" -m "Ported from Evanion/libraries@92320250 and restyled with the Meridian tokens. The case pane uses the ship console frame with the test file and line as its title, the sidecar loads under the base path, and the highlighting follows the theme."
```

### Task 10: The first page, `/api-node/`, with `doc-reference` and the end-to-end checks

**Files:**

- Create: `apps/docs/content/api-node.mdx`
- Modify: `apps/docs/content/_meta.ts`
- Modify: `libs/node/src/index.ts` (docblock of `NodeScopes`)
- Create: `tools/repo-checks/src/doc-reference.test.ts`
- Create: `apps/docs-e2e/src/api-reference.spec.ts`
- Modify: `apps/docs-e2e/src/surfaces.spec.ts`

**Interfaces:**

- Consumes: everything above.
- Produces: the page pattern every later page copies: frontmatter `title`, `kind: reference`, `description`, `package`; one `# ` heading; a Context paragraph; `<ApiFilter />`; one `## \`name\`` plus directive per export; a closing next step.

- [ ] **Step 1: Write the failing guard.** Port the libraries `doc-reference.test.ts` (`git … show 92320250:tools/repo-checks/src/doc-reference.test.ts`) with: `ACL` to `'@nexusdi/devtools'` and the reader cases re-pointed at real devtools and core exports (`graph` for a function, `GraphView` for an interface, `TraceEvent` for a type alias, `DevtoolsError` for an error, `NexusGraph` for the imports case); the expansion cases call `expandReferences` with `{ ...referenceOptions, read }`; `authoredPages()` becomes the content pages from `readSite(CONTENT)`. Add:

```ts
it('gives every entry a docblock summary to open with', () => {
  const bare = referenced.flatMap((entry) => {
    const found = readReference(workspaceRoot, entry.specifier, entry.name);
    return found.summary === ''
      ? [
          `${entry.page}: ${entry.specifier}#${entry.name} has no docblock summary; write one above its declaration in libs/`,
        ]
      : [];
  });
  expect(bare).toEqual([]);
});
```

Remove the libraries early return that skips an export with no docblock in `documents the name every merging entry is about`, since the new rule covers it.

- [ ] **Step 2: Write the page.** `apps/docs/content/api-node.mdx`:

```mdx
---
title: '@nexusdi/node'
kind: reference
description: The exports of @nexusdi/node, with each signature, what its tests state and an example.
package: '@nexusdi/node'
---

# `@nexusdi/node`

A Node server needs each request's scope wherever the request's code runs, without passing it through every call. `@nexusdi/node` binds NexusDI scopes to Node's async context: `nodeScopes()` returns a scope context whose `run()` makes a scope current for a callback and everything it awaits. Each export has one entry below, with what the package's tests state about it.

<ApiFilter />

## `nodeScopes`

<!-- reference @nexusdi/node#nodeScopes example=node -->

## `NodeScopes`

<!-- reference @nexusdi/node#NodeScopes -->

The guide [Scope an HTTP request in Node](/node-request-scopes/) puts `nodeScopes()` to work in a server.
```

Check every claim in the Context paragraph against `libs/node/src/index.ts` before committing. Add `'api-node': { title: '@nexusdi/node' }` under `'-- api'` in `_meta.ts`, after `api-errors`.

- [ ] **Step 3: Run and watch it fail.**
      Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-reference`
      Expected: FAIL, `apps/docs/content/api-node.mdx: @nexusdi/node#NodeScopes has no docblock summary`.

- [ ] **Step 4: Write the docblock.** Above `NodeScopes` in `libs/node/src/index.ts`, write a docblock whose first sentence says what the object is (the scope context `nodeScopes()` returns) and whose later lines describe `run` and `current` as the code implements them. Rebuild: `NX_NO_CLOUD=true NX_DAEMON=false npx nx build @nexusdi/node`. Run the guard again. Expected: PASS.

- [ ] **Step 5: Write the end-to-end test.** `apps/docs-e2e/src/api-reference.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const PAGE = '/next/api-node/';

test('serves every entry and every sentence in the static HTML', async ({
  request,
}) => {
  const html = await (await request.get(PAGE)).text();
  expect(html.match(/class="nexus-api-entry /g)).toHaveLength(2);
  expect(html).toContain('keeps two runs apart');
});

test('loads the cases from under the base path', async ({ page }) => {
  const sidecar = page.waitForRequest((request) =>
    request.url().endsWith('/next/behaviour/node/nodeScopes.json'),
  );
  await page.goto(PAGE);
  await page.locator('.nexus-behaviours').first().scrollIntoViewIfNeeded();
  await sidecar;
  await expect(
    page.getByRole('region', { name: /^libs\/node\/src\/.+:\d+$/ }),
  ).toBeVisible();
});

test('narrows the entries and keeps every one in the page', async ({
  page,
}) => {
  await page.goto(PAGE);
  await page
    .getByRole('searchbox', { name: 'Filter the exports by name' })
    .fill('NodeScopes');
  await expect(page.locator('.nexus-api-entry:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.nexus-api-entry')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.nexus-api-entry:not([hidden])')).toHaveCount(2);
});

for (const theme of ['dark', 'light'] as const) {
  test(`fits a 375 px screen in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(PAGE);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
}
```

Add `'/next/api-node/'` to `PAGES` in `surfaces.spec.ts`. The sentence `keeps two runs apart` is a real title in `libs/node` (measured); if the suite renames it, use the current title.

- [ ] **Step 5b: Restore the content-fence count in `doc-twoslash`.** `/api-node/` is the first page that emits reference `twoslash` fences, so add to `describe('doc-twoslash on apps/docs')` in `tools/repo-checks/src/doc-twoslash.test.ts` a case `finds the fences` that asserts `expect(fences.length).toBeGreaterThan(0)` over `contentFences(CONTENT, workspaceRoot)`. Task 4 left it out because no content page carried a `twoslash` fence.

- [ ] **Step 6: Run the task gate**, the e2e line included. Add `@nexusdi/node` to `--projects`.

- [ ] **Step 7: Dispatch the `docs-reviewer` agent on `apps/docs/content/api-node.mdx`** and fix every defect it reports.

- [ ] **Step 8: Commit** in two commits: `docs(node): describe the scope context nodescopes returns`, then `docs(docs): add the @nexusdi/node api page` with the page, `_meta.ts`, the guard and the e2e files (body: "doc-reference ported from Evanion/libraries@92320250, with a rule that every entry has a docblock summary.").

### Task 10b: Keep the reference components off the guide pages

Nextra 4 serves every MDX page from one catch-all route, so each client component reachable from `mdx-components.js` ships with every page. The reviewer measured `/scopes/` paying about 94 kB raw and 20 kB gzip for the reference work; `next/dynamic` and page-level imports changed nothing.

**Files:**

- Modify: `apps/docs/components/api/BehaviourCatalogue.tsx` (the shell)
- Create: `apps/docs/components/api/BehaviourPane.tsx` (the lazy module), from the pane half of `BehaviourCatalogue.tsx`
- Modify: `apps/docs/components/api/BehaviourCatalogue.test.tsx`, `apps/docs/tools/check-budgets.mjs`, `apps/docs/tools/check-budgets.test.mjs`
- Modify: `libs/node/src/index.ts` (the `nodeScopes` docblock)

- [ ] **Step 1: Measure.** Sum the bytes of every `<script src>` and `<link href>` stylesheet `out/scopes/index.html` loads, raw and gzip, on the current build and on a build with the reference components unregistered and `api-node.mdx` moved aside.
- [ ] **Step 2: Write the failing tests.** The shell server-renders every sentence and no `meridian-console`; with an `IntersectionObserver` that never fires it renders the rail, an empty pane slot and fetches nothing; its source imports no `.css`, no `@nexusdi/meridian-ui` and `BehaviourPane` only through `import('./BehaviourPane')` (a type import is fine).
- [ ] **Step 3: Split.** `BehaviourCatalogue.tsx` keeps the rail, its selection and its arrow keys (focus on the rail survives the load) and an empty `nexus-behaviours__pane` slot carrying the id `aria-controls` names. On intersection it imports `BehaviourPane.tsx`, which holds the pane, the type card, the token keyboard walk, the sidecar fetch on mount, and imports `./behaviour/code-classes.css` and `./behaviour.css`.
- [ ] **Step 4: Ratchet.** `check-budgets` holds `/scopes/`'s total of scripts and stylesheets to `GUIDE_BUDGET` at its measured value, raw and gzip; a total over it fails, and a total more than `GUIDE_SLACK` gzipped bytes under it fails with the numbers to lower it to.
- [ ] **Step 5: Docblock.** `nodeScopes`: "Returns a scope context for Node, backed by its own AsyncLocalStorage, so each call keeps its runs apart."
- [ ] **Step 6: Run the task gate.** The JavaScript-off end-to-end test still shows every entry and sentence.
- [ ] **Step 7: Commit** `perf(docs): load the behaviour pane on reach` and `docs(node): say what nodescopes returns`.

### Task 11: `/api-testing/`, `/api-decorators/` and `/api-errors-package/`

**Files:**

- Create: `apps/docs/content/api-testing.mdx`, `api-decorators.mdx`, `api-errors-package.mdx`
- Modify: `apps/docs/content/_meta.ts`, `apps/docs-e2e/src/surfaces.spec.ts`
- Modify: `libs/testing/src/index.ts` (docblocks of `createTestingContainer`, `TestingContainerBuilder`, `TestingCreateOptions`, `ModuleOverrideOptions`)

- [ ] **Step 1: Write the pages** with the Task 10 frontmatter shape (`package` set to the package), a Context paragraph checked against the package source, `<ApiFilter />`, the entries below, and a next step linking `/testing/`, `/decorators/` and `/error-text/` respectively.

`api-testing.mdx` entries:

```mdx
## `createTestingContainer`

<!-- reference @nexusdi/testing#createTestingContainer example=override-lifetime -->

## `TestingContainerBuilder`

<!-- reference @nexusdi/testing#TestingContainerBuilder example=override-module -->

## `TestingCreateOptions`

<!-- reference @nexusdi/testing#TestingCreateOptions -->

## `ModuleOverrideOptions`

<!-- reference @nexusdi/testing#ModuleOverrideOptions -->

## `OverrideError`

<!-- reference @nexusdi/testing#OverrideError -->
```

`api-decorators.mdx` entries:

```mdx
## `Injectable`

<!-- reference @nexusdi/decorators#Injectable example=decorators -->

## `Inject`

<!-- reference @nexusdi/decorators#Inject -->

## `Module`

<!-- reference @nexusdi/decorators#Module -->

## `ModuleDecoratorConfig`

<!-- reference @nexusdi/decorators#ModuleDecoratorConfig -->

## `LegacyDecoratorsError`

<!-- reference @nexusdi/decorators#LegacyDecoratorsError -->
```

`api-errors-package.mdx` entries:

```mdx
## `errors`

<!-- reference @nexusdi/errors#errors example=errors -->

## `explain`

<!-- reference @nexusdi/errors#explain example=explain -->

## `ErrorsOptions`

<!-- reference @nexusdi/errors#ErrorsOptions -->

## `ExplainOptions`

<!-- reference @nexusdi/errors#ExplainOptions -->
```

Add `'api-testing'`, `'api-decorators'`, `'api-errors-package'` to `_meta.ts` with the package names as titles, in that order after `api-node`.

- [ ] **Step 2: Run `doc-reference` and watch it fail** on the four testing exports without a summary. `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-reference`.

- [ ] **Step 3: Write the four docblocks** in `libs/testing/src/index.ts`. Each first sentence says what the export is or does, as the code implements it; `createTestingContainer`'s later lines name `override`, `overrideModule` and `create`. Rebuild `@nexusdi/testing` and run the guard. Expected: PASS.

- [ ] **Step 4: Add the three paths to `surfaces.spec.ts`.**

- [ ] **Step 5: Run the task gate** with `@nexusdi/testing` added. Dispatch `docs-reviewer` on the three pages and fix what it reports.

- [ ] **Step 6: Commit:** `docs(testing): describe createtestingcontainer and its option types`, then `docs(docs): add the testing, decorators and errors api pages`.

### Task 12: `/api-devtools/`, `/api-federation/` and `/api-interceptors/`

**Files:**

- Create: `apps/docs/content/api-devtools.mdx`, `api-federation.mdx`, `api-interceptors.mdx`
- Modify: `apps/docs/content/_meta.ts`, `apps/docs-e2e/src/surfaces.spec.ts`
- Modify: `libs/devtools/src/devtools.ts` (`DevtoolsOptions`), `libs/devtools/src/render/labels.ts` (`RenderOptions`), `libs/federation/src/contract.ts` (`Contract`), `libs/interceptors/src/types.ts` (`GlobalEntry`, `GlobalTarget`, `InterceptorsOptions`, `InterceptorToken`), `libs/interceptors/src/interceptor-error.ts` (`InterceptorErrorCode`, `InvalidReason`), `libs/interceptors/src/tap.ts` (`TapObserver`)
- Modify: `libs/devtools/docs/examples.md` (region `to-dot`), `libs/interceptors/docs/examples.md` (region `use-interceptors`)

- [ ] **Step 1: Write the two regions, test-first.** Append to `libs/devtools/docs/examples.md`, under its own `##` heading with a lead-in sentence:

````md
<!-- #region to-dot -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, toDot } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StellarCharts implements INavCharts {
  plot(to: string): string {
    return `course to ${to}`;
  }
}
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
  exports: [NAV_CHARTS],
});

toDot(inspect(Navigation)).split('\n')[0]; // -> 'digraph nexus {'
```

<!-- #endregion to-dot -->
````

Append to `libs/interceptors/docs/examples.md`:

````md
<!-- #region use-interceptors -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import {
  UseInterceptors,
  interceptor,
  interceptors,
} from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IComms {
  hail(name: string): string;
}
const COMMS = new Token<IComms>('Comms');
const LOUDHAILER = new Token<Interceptor>('Loudhailer');

class Loudhailer implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return String(next()).toUpperCase();
  }
}

@UseInterceptors(LOUDHAILER)
class Comms implements IComms {
  hail(name: string): string {
    return `hailing ${name}`;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Bridge',
    providers: [provide(COMMS, { useClass: Comms })],
    exports: [COMMS],
  }),
  {
    plugins: [
      interceptors({
        register: [interceptor(LOUDHAILER, { useClass: Loudhailer })],
      }),
    ],
  },
);
ship.get(COMMS).hail('Meridian'); // -> 'HAILING MERIDIAN'
```

<!-- #endregion use-interceptors -->
````

Run `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test --projects=@nexusdi/devtools,@nexusdi/interceptors`. A failing claim means the region's code is wrong; correct the code against `libs/interceptors/src/integration.test.ts` and `libs/devtools/src/render/dot.ts` so the region still demonstrates the export it names. `npm-readmes.test.ts` holds the region-file rules (region markers, a `// ->` claim); run it too.

- [ ] **Step 2: Write the pages** in the Task 10 shape, next steps linking `/introspection/`, `/federation/` (written in phase 2; until it exists link `/write-a-plugin/`, and G7 holds the link) and `/interceptors/`.

`api-devtools.mdx` entries:

```mdx
## `devtools`

<!-- reference @nexusdi/devtools#devtools example=graph -->

## `graph`

<!-- reference @nexusdi/devtools#graph example=graph -->

## `inspect`

<!-- reference @nexusdi/devtools#inspect example=inspect -->

## `trace`

<!-- reference @nexusdi/devtools#trace example=graph -->

## `toMermaid`

<!-- reference @nexusdi/devtools#toMermaid example=render -->

## `toDot`

<!-- reference @nexusdi/devtools#toDot example=to-dot -->

## `parseGraph`

<!-- reference @nexusdi/devtools#parseGraph example=parse -->

## `DevtoolsOptions`

<!-- reference @nexusdi/devtools#DevtoolsOptions -->

## `GraphAnnotator`

<!-- reference @nexusdi/devtools#GraphAnnotator example=annotate -->

## `GraphNote`

<!-- reference @nexusdi/devtools#GraphNote -->

## `GraphView`

<!-- reference @nexusdi/devtools#GraphView -->

## `InspectOptions`

<!-- reference @nexusdi/devtools#InspectOptions -->

## `NexusGraph`

<!-- reference @nexusdi/devtools#NexusGraph -->

## `RenderOptions`

<!-- reference @nexusdi/devtools#RenderOptions -->

## `TraceEvent`

<!-- reference @nexusdi/devtools#TraceEvent -->

## `TraceEventByType`

<!-- reference @nexusdi/devtools#TraceEventByType -->

## `DevtoolsError`

<!-- reference @nexusdi/devtools#DevtoolsError -->
```

`api-federation.mdx` entries:

```mdx
## `defineContract`

<!-- reference @nexusdi/federation#defineContract example=contracts -->

## `federation`

<!-- reference @nexusdi/federation#federation example=contracts -->

## `Contract`

<!-- reference @nexusdi/federation#Contract -->

## `ContractVersionError`

<!-- reference @nexusdi/federation#ContractVersionError -->

## `federationText`

<!-- reference @nexusdi/federation/text#federationText example=text -->
```

`api-interceptors.mdx` entries:

```mdx
## `interceptors`

<!-- reference @nexusdi/interceptors#interceptors example=intercept -->

## `interceptor`

<!-- reference @nexusdi/interceptors#interceptor example=intercept -->

## `tap`

<!-- reference @nexusdi/interceptors#tap example=intercept -->

## `UseInterceptors`

<!-- reference @nexusdi/interceptors#UseInterceptors example=use-interceptors -->

## `CallContext`

<!-- reference @nexusdi/interceptors#CallContext -->

## `ExemptToken`

<!-- reference @nexusdi/interceptors#ExemptToken -->

## `GlobalEntry`

<!-- reference @nexusdi/interceptors#GlobalEntry -->

## `GlobalTarget`

<!-- reference @nexusdi/interceptors#GlobalTarget -->

## `Interceptor`

<!-- reference @nexusdi/interceptors#Interceptor example=intercept -->

## `InterceptorBinding`

<!-- reference @nexusdi/interceptors#InterceptorBinding -->

## `InterceptorClass`

<!-- reference @nexusdi/interceptors#InterceptorClass -->

## `InterceptorEntry`

<!-- reference @nexusdi/interceptors#InterceptorEntry -->

## `InterceptorErrorCode`

<!-- reference @nexusdi/interceptors#InterceptorErrorCode -->

## `InterceptorMap`

<!-- reference @nexusdi/interceptors#InterceptorMap -->

## `InterceptorsOptions`

<!-- reference @nexusdi/interceptors#InterceptorsOptions -->

## `InterceptorToken`

<!-- reference @nexusdi/interceptors#InterceptorToken -->

## `InvalidReason`

<!-- reference @nexusdi/interceptors#InvalidReason -->

## `MethodKey`

<!-- reference @nexusdi/interceptors#MethodKey -->

## `Next`

<!-- reference @nexusdi/interceptors#Next -->

## `TapObserver`

<!-- reference @nexusdi/interceptors#TapObserver -->

## `InterceptorError`

<!-- reference @nexusdi/interceptors#InterceptorError -->

## `interceptorsText`

<!-- reference @nexusdi/interceptors/text#interceptorsText example=text -->
```

Add the three to `_meta.ts` and `surfaces.spec.ts`.

- [ ] **Step 3: Run `doc-reference` and watch it fail** on the ten exports listed under Files.

- [ ] **Step 4: Write the ten docblocks**, each first sentence what the export is, checked against its code and tests. Rebuild the three packages and run `doc-reference` and `doc-twoslash`. Expected: PASS.

- [ ] **Step 5: Run the task gate** with the three packages added. Dispatch `docs-reviewer` on the three pages and fix what it reports.

- [ ] **Step 6: Commit:** one `docs(<pkg>): …` commit per package for its docblocks and region (`docs(devtools): add a todot example and describe the option types`, `docs(federation): describe the contract type`, `docs(interceptors): add a useinterceptors example and describe the option types`), then `docs(docs): add the devtools, federation and interceptors api pages`.

### Task 13: `/api/`, the core reference

**Files:**

- Create: `apps/docs/content/api.mdx`
- Modify: `apps/docs/content/_meta.ts`, `tools/repo-checks/src/doc-floor-allowance.json`, `apps/docs-e2e/src/surfaces.spec.ts`, `apps/docs-e2e/src/api-reference.spec.ts`
- Modify: `libs/core/src/definitions/modifiers.ts` (`optional`, `lazy`, `all`), `libs/core/src/runtime/options.ts` (`CheckOptions`, `CreateOptions`, `LookupOptions`), `libs/core/src/blueprint/views.ts` (`CompileContext`, `EdgeView`, `ModuleView`, `ProviderRewrite`, `ProviderView`), `libs/core/src/runtime/plugins.ts` (`CompilePluginHooks`, `PluginContext`), `libs/core/src/definitions/define-module.ts` (`ConfigurableModuleConfig`, `ModuleConfig`), `libs/core/src/definitions/provide.ts` (`FactoryDefinition`, `PromiseTokenMessage`), `libs/core/src/errors/nexus-error.ts` (`NexusErrorOptions`), `libs/core/src/runtime/root.ts` (`RootKeyMessage`), `libs/core/src/definitions/provider-literal.ts` (`UntypedFunctionMessage`)
- Modify: `libs/core/docs/providers.md` (regions `optional` and `all`)

- [ ] **Step 1: Write the two regions, test-first.** Append to `libs/core/docs/providers.md`, each under its own `##` with a lead-in:

````md
<!-- #region optional -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, optional, provide } from '@nexusdi/core';

interface ITelemetry {
  record(event: string): void;
}
interface IShipComputer {
  boot(): string;
}
const TELEMETRY = new Token<ITelemetry>('Telemetry');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class ShipComputer implements IShipComputer {
  static deps = [optional(TELEMETRY)] as const;
  constructor(private readonly telemetry: ITelemetry | undefined) {}
  boot() {
    this.telemetry?.record('boot');
    return this.telemetry ? 'logged' : 'silent';
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Bridge',
    providers: [provide(COMPUTER, { useClass: ShipComputer })],
  }),
);
ship.get(COMPUTER).boot(); // -> 'silent'
```

<!-- #endregion optional -->

<!-- #region all -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  provide,
} from '@nexusdi/core';

interface IDiagnostic {
  run(): boolean;
}
interface IDiagnosticBay {
  passed(): number;
}
const DIAGNOSTICS = new MultiToken<IDiagnostic>('Diagnostics');
const BAY = new Token<IDiagnosticBay>('DiagnosticBay');

class DiagnosticBay implements IDiagnosticBay {
  static deps = [all(DIAGNOSTICS)] as const;
  constructor(private readonly checks: IDiagnostic[]) {}
  passed() {
    return this.checks.filter((check) => check.run()).length;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(DIAGNOSTICS, { useValue: { run: () => true } }),
      provide(DIAGNOSTICS, { useValue: { run: () => false } }),
      provide(BAY, { useClass: DiagnosticBay }),
    ],
  }),
);
ship.get(BAY).passed(); // -> 1
```

<!-- #endregion all -->
````

Run `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core`. Correct any failing code against `libs/core/src/definitions/modifiers.ts`; `Resolve<Optional<T>>` is `T | undefined` and `Resolve<All<T>>` is `T[]`.

- [ ] **Step 2: Write the page.** Frontmatter `title: '@nexusdi/core'`, `package: '@nexusdi/core'`. Context paragraph: what core does (a module tree compiled and validated by `Nexus.create` before anything is built) and that the `./text` entry holds core's full error text; that error classes are listed on [Error codes](/api-errors/) and each code has its own page. Under `## \`CreateOptions\``, after the directive, write the paragraph the spec asks for on the `plugins`option of`Nexus.create`(registration order and the first-party plugins), checked against`libs/core/src/runtime/options.ts`. Next step: [Getting started](/getting-started/). Entries:

```mdx
## `Nexus`

<!-- reference @nexusdi/core#Nexus example=interfaces-and-tokens -->

## `Token`

<!-- reference @nexusdi/core#Token example=interfaces-and-tokens -->

## `MultiToken`

<!-- reference @nexusdi/core#MultiToken example=providers -->

## `defineModule`

<!-- reference @nexusdi/core#defineModule example=modules -->

## `provide`

<!-- reference @nexusdi/core#provide example=providers -->

## `optional`

<!-- reference @nexusdi/core#optional example=optional -->

## `lazy`

<!-- reference @nexusdi/core#lazy example=lazy -->

## `all`

<!-- reference @nexusdi/core#all example=all -->

## `REQUEST`

<!-- reference @nexusdi/core#REQUEST example=scopes -->

## `isNexusError`

<!-- reference @nexusdi/core#isNexusError example=error-message -->

## `errorBase`

<!-- reference @nexusdi/core#errorBase -->

## `NEXUS_PLUGIN_API`

<!-- reference @nexusdi/core#NEXUS_PLUGIN_API example=plugins -->

## `SUPPORTED_PLUGIN_APIS`

<!-- reference @nexusdi/core#SUPPORTED_PLUGIN_APIS -->

## `DOCS_URL`

<!-- reference @nexusdi/core#DOCS_URL -->

## `declareClass`

<!-- reference @nexusdi/core#declareClass -->

## `declareModuleClass`

<!-- reference @nexusdi/core#declareModuleClass -->

## `declareProperty`

<!-- reference @nexusdi/core#declareProperty -->

## `describeValue`

<!-- reference @nexusdi/core#describeValue -->

## `displayName`

<!-- reference @nexusdi/core#displayName -->

## `isForeign`

<!-- reference @nexusdi/core#isForeign -->

## `moduleDefinitionOf`

<!-- reference @nexusdi/core#moduleDefinitionOf -->

## `All`

<!-- reference @nexusdi/core#All -->

## `BlueprintView`

<!-- reference @nexusdi/core#BlueprintView -->

## `CheckedRoot`

<!-- reference @nexusdi/core#CheckedRoot -->

## `CheckOptions`

<!-- reference @nexusdi/core#CheckOptions -->

## `CompileContext`

<!-- reference @nexusdi/core#CompileContext -->

## `CompilePluginHooks`

<!-- reference @nexusdi/core#CompilePluginHooks -->

## `ConfigurableModule`

<!-- reference @nexusdi/core#ConfigurableModule example=configurable-module-async -->

## `ConfigurableModuleConfig`

<!-- reference @nexusdi/core#ConfigurableModuleConfig -->

## `CreateOptions`

<!-- reference @nexusdi/core#CreateOptions -->

## `Ctor`

<!-- reference @nexusdi/core#Ctor -->

## `Dep`

<!-- reference @nexusdi/core#Dep -->

## `DepFor`

<!-- reference @nexusdi/core#DepFor -->

## `DepsFor`

<!-- reference @nexusdi/core#DepsFor -->

## `DepsMap`

<!-- reference @nexusdi/core#DepsMap -->

## `EdgeView`

<!-- reference @nexusdi/core#EdgeView -->

## `ErrorFields`

<!-- reference @nexusdi/core#ErrorFields -->

## `ErrorLifetime`

<!-- reference @nexusdi/core#ErrorLifetime -->

## `ErrorText`

<!-- reference @nexusdi/core#ErrorText -->

## `ErrorTextKit`

<!-- reference @nexusdi/core#ErrorTextKit -->

## `ErrorTextPack`

<!-- reference @nexusdi/core#ErrorTextPack -->

## `ExportEntry`

<!-- reference @nexusdi/core#ExportEntry -->

## `FactoryDefinition`

<!-- reference @nexusdi/core#FactoryDefinition -->

## `ForRootAsyncConfig`

<!-- reference @nexusdi/core#ForRootAsyncConfig -->

## `InjectionToken`

<!-- reference @nexusdi/core#InjectionToken -->

## `InvalidProviderReason`

<!-- reference @nexusdi/core#InvalidProviderReason -->

## `InvalidTokenReason`

<!-- reference @nexusdi/core#InvalidTokenReason -->

## `Lazy`

<!-- reference @nexusdi/core#Lazy -->

## `LazyAsyncMessage`

<!-- reference @nexusdi/core#LazyAsyncMessage -->

## `Lifetime`

<!-- reference @nexusdi/core#Lifetime -->

## `LookupOptions`

<!-- reference @nexusdi/core#LookupOptions -->

## `ModuleConfig`

<!-- reference @nexusdi/core#ModuleConfig -->

## `ModuleDefinition`

<!-- reference @nexusdi/core#ModuleDefinition -->

## `ModuleRef`

<!-- reference @nexusdi/core#ModuleRef -->

## `ModuleView`

<!-- reference @nexusdi/core#ModuleView -->

## `NearMiss`

<!-- reference @nexusdi/core#NearMiss -->

## `NexusErrorByCode`

<!-- reference @nexusdi/core#NexusErrorByCode -->

## `NexusErrorCode`

<!-- reference @nexusdi/core#NexusErrorCode -->

## `NexusErrorOptions`

<!-- reference @nexusdi/core#NexusErrorOptions -->

## `NexusPlugin`

<!-- reference @nexusdi/core#NexusPlugin example=plugin-canonical -->

## `NexusRequest`

<!-- reference @nexusdi/core#NexusRequest -->

## `NoLifetimeMessage`

<!-- reference @nexusdi/core#NoLifetimeMessage -->

## `Optional`

<!-- reference @nexusdi/core#Optional -->

## `OverrideDefinition`

<!-- reference @nexusdi/core#OverrideDefinition -->

## `PluginContext`

<!-- reference @nexusdi/core#PluginContext -->

## `PluginInvalidReason`

<!-- reference @nexusdi/core#PluginInvalidReason -->

## `PromiseTokenMessage`

<!-- reference @nexusdi/core#PromiseTokenMessage -->

## `Provider`

<!-- reference @nexusdi/core#Provider -->

## `ProviderEntries`

<!-- reference @nexusdi/core#ProviderEntries -->

## `ProviderEntry`

<!-- reference @nexusdi/core#ProviderEntry -->

## `ProviderFailure`

<!-- reference @nexusdi/core#ProviderFailure -->

## `ProviderLiteral`

<!-- reference @nexusdi/core#ProviderLiteral example=provider-literals -->

## `ProviderRewrite`

<!-- reference @nexusdi/core#ProviderRewrite -->

## `ProviderView`

<!-- reference @nexusdi/core#ProviderView -->

## `Resolve`

<!-- reference @nexusdi/core#Resolve -->

## `ResolveAll`

<!-- reference @nexusdi/core#ResolveAll -->

## `ResolvedDeps`

<!-- reference @nexusdi/core#ResolvedDeps -->

## `RootConfig`

<!-- reference @nexusdi/core#RootConfig -->

## `RootKeyMessage`

<!-- reference @nexusdi/core#RootKeyMessage -->

## `RootRef`

<!-- reference @nexusdi/core#RootRef -->

## `SchemaIssue`

<!-- reference @nexusdi/core#SchemaIssue -->

## `Scope`

<!-- reference @nexusdi/core#Scope example=scope-extend -->

## `StandardSchemaV1`

<!-- reference @nexusdi/core#StandardSchemaV1 -->

## `Tokens`

<!-- reference @nexusdi/core#Tokens -->

## `TraceEvent`

<!-- reference @nexusdi/core#TraceEvent -->

## `TraceEventByType`

<!-- reference @nexusdi/core#TraceEventByType -->

## `UninferredRoot`

<!-- reference @nexusdi/core#UninferredRoot -->

## `UntypedFunctionMessage`

<!-- reference @nexusdi/core#UntypedFunctionMessage -->

## `coreText`

<!-- reference @nexusdi/core/text#coreText -->

## `layoutText`

<!-- reference @nexusdi/core/text#layoutText -->
```

Add `api: { title: '@nexusdi/core' }` first under `'-- api'` in `_meta.ts`. Remove `"api"` from `doc-floor-allowance.json` (leave `{}`); `doc-floor` fails a stale entry, so this is required.

- [ ] **Step 3: Run `doc-reference` and watch it fail** on the twenty core exports listed under Files.

- [ ] **Step 4: Write the twenty docblocks.** The three modifiers carry these, which restate the interface docblocks above them in `modifiers.ts`:

```ts
/** Marks a dep as optional: it resolves to `undefined` when no provider of the token is visible. */
export function optional<T>(token: InjectionToken<T>): Optional<T> {
/** Marks a dep as lazy: it resolves to a thunk, which is how a provider declares one edge of a cycle. */
export function lazy<T>(token: InjectionToken<T>): Lazy<T> {
/** Collects a MultiToken: the dep resolves to every contribution visible to the provider. */
export function all<T>(token: MultiToken<T>): All<T> {
```

Write the other seventeen from each declaration and its tests, first sentence what it is. Rebuild core and run `doc-reference`, `doc-twoslash` and `doc-floor`. Expected: PASS.

- [ ] **Step 5: Extend the end-to-end checks.** Add `'/next/api/'` to `surfaces.spec.ts`, and in `api-reference.spec.ts` run the 375 px test over `['/next/api-node/', '/next/api/']` (the core page holds the longest signatures).

- [ ] **Step 6: Run the task gate** with `@nexusdi/core` added. Run `check-budgets`; `/api/` is the heaviest page, and a budget failure means the page weighs too much; reduce the page and leave the budget alone. Dispatch `docs-reviewer` on `api.mdx` and fix what it reports.

- [ ] **Step 7: Commit:** `docs(core): add optional and all examples and describe the remaining exports`, then `docs(docs): add the @nexusdi/core api page`.

### Task 14: G10, and the recipe for later packages

**Files:**

- Create: `tools/repo-checks/src/docs/doc-export-coverage.ts`, `tools/repo-checks/src/doc-export-coverage.test.ts`, `tools/repo-checks/src/doc-export-coverage-allowance.json`
- Create: `tools/repo-checks/src/__fixtures__/docs/doc-export-coverage/{clean,sabotaged}/content/*.mdx`
- Modify: `.claude/skills/docs-page/SKILL.md`

**Interfaces:**

- Produces: `checkExportCoverage(input: { pages: DocsPage[]; packages: { name: string; entries: Map<string, ExportInfo[]> }[]; exempt: ReadonlyMap<string, string>; allowance: Record<string, { unexercised: string[] }> }): string[]`.

- [ ] **Step 1: Write the failing tests.** Fixtures: `clean/content/api-x.mdx` (`kind: reference`, `package: '@nexusdi/x'`, `## \`make\``with a`twoslash`fence calling`make()`, `## \`Shape\``); `sabotaged/content/api-x.mdx`missing`## \`Shape\``, plus `sabotaged/content/api-y.mdx`with`package: '@nexusdi/x'` too. Tests:

```ts
const X = {
  name: '@nexusdi/x',
  entries: new Map([
    [
      '@nexusdi/x',
      [
        { name: 'make', callable: true, typeOnly: false, error: false },
        { name: 'Shape', callable: false, typeOnly: true, error: false },
      ],
    ],
  ]),
};

it('passes a clean tree', () => {
  expect(
    checkExportCoverage({
      pages: tree('clean'),
      packages: [X],
      exempt: new Map(),
      allowance: {},
    }),
  ).toEqual([]);
});

it.each([
  "@nexusdi/x exports 'Shape' and api-x.mdx has no '## `Shape`' heading",
  '@nexusdi/x has two reference pages: api-x.mdx and api-y.mdx',
])('fails the sabotaged tree: %s', (phrase) => {
  const findings = checkExportCoverage({
    pages: tree('sabotaged'),
    packages: [X],
    exempt: new Map(),
    allowance: {},
  });
  expect(findings.some((finding) => finding.includes(phrase))).toBe(true);
});

it('fails a library with no reference page, naming the page to add', () => {
  const findings = checkExportCoverage({
    pages: [],
    packages: [X],
    exempt: new Map(),
    allowance: {},
  });
  expect(findings).toEqual([
    expect.stringContaining(
      "add apps/docs/content/api-x.mdx with kind: reference and package: '@nexusdi/x'",
    ),
  ]);
});

it('fails an allowance entry that is no longer needed', () => {
  const findings = checkExportCoverage({
    pages: tree('clean'),
    packages: [X],
    exempt: new Map(),
    allowance: { '@nexusdi/x': { unexercised: ['make'] } },
  });
  expect(findings).toEqual([
    expect.stringContaining(
      "'make' is exercised now; remove it from doc-export-coverage-allowance.json",
    ),
  ]);
});

it('holds on apps/docs', async () => {
  expect(checkExportCoverage(await workspaceInput())).toEqual([]);
});
```

`workspaceInput()` builds the input from `readExpandedSite(CONTENT)` plus the reference expansion (`loadMdSiblings` with `referenceOptions`, so a directive's example fence counts as executed), `libraries(workspaceRoot)` with `readPackageExports`, `exempt = new Map([['@nexusdi/core', 'Each error class has a code page under /errors/, and /api-errors/ lists them (spec section 22, item 9).']])` applied to exports whose `error` is true or whose name ends in `Error`, and the allowance file. The derived file name for a missing page uses `api-<dir>`, with `api` for core and `api-errors-package` for errors, read from a small inline map with a comment that these two slugs are the spec's.

- [ ] **Step 2: Run them and watch them fail.** `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-export-coverage`. Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement** `docs/doc-export-coverage.ts` on the libraries rules (libraries `doc-export-coverage.test.ts` lines 1 to 120 hold them): headings first, then for each callable non-exempt export, whether an executable fence's visible lines (below the last `// ---cut---`) name it. The ported comments drop every `@evanion` fact.

- [ ] **Step 4: Seed the allowance.** Run the workspace test once and copy each package's reported unexercised callables into `doc-export-coverage-allowance.json` as `{ "<package>": { "unexercised": [ … ] } }`, sorted. Expected entries are a subset of core `declareClass`, `declareModuleClass`, `declareProperty`, `describeValue`, `displayName`, `errorBase`, `isForeign`, `moduleDefinitionOf`, and core `./text` `layoutText`, minus any a content page already exercises. The heading half must report nothing; a missing heading is a page defect to fix now.

- [ ] **Step 5: Run the tests.** Same command. Expected: PASS.

- [ ] **Step 6: Write the recipe** in `.claude/skills/docs-page/SKILL.md`, a new section "Adding an API page or entry" after "Pick the work": a new export needs a docblock summary, a `describe` naming it if callable, a `## \`name\``and directive on its package's page, and an`example=`region in`libs/<pkg>/docs/*.md`if it is callable; a new library needs`apps/docs/content/api-<dir>.mdx`with`kind: reference`and`package`, a `_meta.ts`entry under the API separator, its name in`tools/repo-checks/package.json`'s test `dependsOn`, and a `json`reporter in its`vite.config.ts`; the guards that fail otherwise are `doc-export-coverage`, `doc-reference`, `doc-behaviour`and`doc-behaviour-run`. Add one trap: "A stale `components/api/behaviour/`serves old sentences. Run`npx nx run @nexusdi/docs:behaviour-data` after renaming a test."

- [ ] **Step 7: Run the task gate.**

- [ ] **Step 8: Commit:** `test(repo): require an api entry for every export` (body: "Ported from Evanion/libraries@92320250; finds each package's page by its package frontmatter."), then `docs(repo): add the api page recipe to the docs-page skill`.

### Task 15: Review and the pull request

- [ ] **Step 1: Rebase** on `origin/release/0.4`: `NX_NO_CLOUD=true NX_DAEMON=false git fetch origin && NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4`. If `feat/startup-profiler` or `feat/integrations-0.4` merged in the meantime, `doc-export-coverage` names their exports; add their entries, docblocks and `describe` blocks in this branch before continuing.

- [ ] **Step 2: Run CI's command over every project:** `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck`, then `NX_NO_CLOUD=true NX_DAEMON=false npx nx e2e @nexusdi/docs-e2e`, then `npx prettier --check .`. All pass.

- [ ] **Step 3: Look at the pages** in a browser through `node apps/docs-e2e/src/support/serve.mjs`: `/next/api/` and `/next/api-devtools/` at 1280 px and 375 px, dark and light. Open a catalogue, arrow through its rail, hover a typed token, open a docblock, filter to nothing and clear. Record screenshots in the ledger. Fix what reads wrong against section 2 of this plan.

- [ ] **Step 4: Final review** by an independent opus reviewer over the whole branch against this plan and spec section 22. Fix rounds until it reports nothing.

- [ ] **Step 5: Push and open the pull request** into `release/0.4`: `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/docs-api-reference`, then `gh pr create --base release/0.4` with a body that lists the eight pages, the guards and the owner step. Merging is the owner's (spec section 20). Stop there.

### Task 16: The adapter pages, once `feat/integrations-0.4` merges

**Depends on:** `feat/integrations-0.4` merged into `release/0.4`, and this branch rebased onto it. The six packages (`@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/react-router`, `@nexusdi/react`, `@nexusdi/vitest`) do not exist on `release/0.4` until then. Section 3's rule for later packages (spec section 22 item 10) already names their pages; this task builds them.

**Files:**

- Create: `apps/docs/content/api-hono.mdx`, `api-express.mdx`, `api-fastify.mdx`, `api-react-router.mdx`, `api-react.mdx`, `api-vitest.mdx`
- Modify: `apps/docs/content/_meta.ts`

`feat/integrations-0.4` writes the docblock summaries and the G11 `describe` blocks in the six packages. This task writes the pages and their `<!-- reference -->` markers only, and runs the guards to confirm the packages pass; a package that fails goes back to that branch.

- [ ] **Step 1: Rebase and regenerate.** Rebase onto `release/0.4`, run `npx nx run @nexusdi/docs:behaviour-data`, and confirm `libraries()` lists the six packages (each has a library entry in its `exports` map) and that `public/behaviour/<dir>/` holds their sidecars.
- [ ] **Step 2: One page per package**, in the shape `api-node.mdx` set: frontmatter `title`, `kind: reference`, `description`, `package`; one `# ` heading; a Context paragraph checked against the package's source; `<ApiFilter />`; one `## \`name\``and one`<!-- reference @nexusdi/<dir>#name -->`per export of every entry point, with`example=<region>`where the package's`docs/*.md`holds one; a closing next step to the package's guide. Add each under the API separator of`_meta.ts`.
- [ ] **Step 3: Confirm the guards pass.** G10 (one `reference` page per package, a heading per export), G11 (a `describe` per callable export, no white-box case on a rail), `doc-reference` (a docblock summary per entry), `doc-behaviour-run`, `doc-twoslash` (the `tsx` example fences of `react` and `react-router` compile under the prelude). A failure in a package is reported to the integrations workstream; this task changes neither the packages nor the guards.
- [ ] **Step 4: Budgets.** Run `check-budgets`; `GUIDE_BUDGET` holds `/scopes/` and the behaviour sidecars stay under `BEHAVIOUR_BUDGET`.
- [ ] **Step 5: Run the task gate** with every `libs/*` project, and dispatch `docs-reviewer` on the six pages.
- [ ] **Step 6: Commit** `docs(docs): add the adapter api pages`.
