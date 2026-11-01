# Moving diagnostics out of core

Status: proposal, 2026-11-01. An opus architect wrote it for the owner. Nothing here is
approved. Section 9 lists the owner's decisions.

Packages changed if approved: `@nexusdi/core`, `@nexusdi/devtools`, `@nexusdi/cli`, and
the docs and examples that call `Nexus.check`.

Depends on:

- The code on `origin/release/0.4` at `1f7af2f9`. Every file and figure below was read or
  measured there.
- `specs/2026-09-23-core-0.4-design.md` (D5, D9, D15 and the feature placement table) and
  `specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`
  (P1 to P5, and section 2.5.9 on subpaths).

## 1. Problem

Core's ESM gzip size grew from 19,312 B on 2026-10-15 to 22,450 B on `1f7af2f9`, a 16%
rise. The owner asked whether code that a running app never needs can leave core for
packages such as `@nexusdi/devtools`, so every bundle carries less.

The pillars at stake are "lightweight: few dependencies, a minimal bundle" and "an async
core". The positioning line is "if it type-checks and starts, the wiring is right". A move
must keep that line true for an app that registers no plugin.

## 2. Answer

Core holds little that can leave. D15 already moved the large piece: every message, fix
line and near-miss search lives in `@nexusdi/core/text` and `@nexusdi/errors` (3,869 B
when D15 measured the pack), which no app without `errors()` or `devtools()` carries. The 3,138 B of growth
since 2026-10-15 splits like this (section 3.2): 1,518 B of features and fixes that start
and resolve need, 507 B of start-time validation, 842 B of diagnostic data and 271 B of
foreign-copy detection.

Every option measured in section 4 together frees at most 761 B (3.4%) without touching
the plugin contribution points. Most of those bytes put information into the one-line
message that a production log prints without a plugin, and removing them makes those logs
worse.

Two moves lose nothing a running app needs. They save 337 B in core and 317 B in the
`hono-worker` bundle:

- `Nexus.check` moves to `check()` at a new core subpath, `@nexusdi/core/check` (237 B).
- `CircularDependencyError` drops its unreleased `kinds` field, and `coreText` derives the
  step kinds from the view (98 B).

Both fit 0.4.0-rc.3. Section 8 names the bigger lever for 0.5: the compiler and runtime
hold 18.5 KB of the 22.4 KB, and only the D5 consolidation workstream reaches it.

## 3. What core holds, by when it matters

### 3.1 Method

Every figure is a gzip byte count by the method of core spec 12.4: the `examples/size`
fixture, esbuild `--bundle --minify --format=esm`, gzip level 9. The measurement bundles
core from source through the `@nexusdi/source` condition, which gives 22,466 B against
22,450 B for the built `dist`. An item's figure is the baseline minus a build in which an
esbuild load plugin replaced the item's code with a stub. Items share code, so the figures
of separate items do not add up exactly; section 6 measures the combinations. Rows marked
"prorated" split the rest of the bundle by each file's share of the minified output, for
code no stub can isolate.

The categories:

- (a) needed to start and resolve.
- (b) start-time validation that turns a wiring bug into a clear error before any
  constructor runs.
- (c) diagnostics, explanations and introspection: data for messages, views, trace
  events and `check()`.
- (d) dev-only checks, which catch a packaging mistake in development.

### 3.2 The growth since 2026-10-15

| Commit     | Change                                                | Class | Gzip B |
| ---------- | ----------------------------------------------------- | ----- | -----: |
| `bbf3ce71` | load imports (a loaded module reads host exports)     | (a)   |    545 |
| `b3f79b25` | keep a held module's ids across a load                | (a)   |    444 |
| `4e2a44a5` | multi tokens across the container, with 2 follow-ups  | (a)   |    317 |
| `5281cf35` | `lazy(all())`, with the modifier commit `2ead3e5e`    | (a)   |    153 |
| `c91e0e8e` | load guards for a fresh compile.module replacement    | (a)   |     90 |
| other      | perf, `loadOnce`, renames                             | (a)   |    -31 |
| `b409fe67` | reject a contribution no provider can read            | (b)   |    381 |
| `456f8999` | run sync schemas in `check()`                         | (b)   |    126 |
| `e2212550` | schema issues in the one-line message, hostile paths  | (c)   |    327 |
| `9d700565` | `lazy:read` trace event                               | (c)   |    136 |
| `df01064b` | `describeValue` names tokens and modules              | (c)   |    106 |
| `6185e72e` | name the unready contribution in `NEXUS_NOT_READY`    | (c)   |     98 |
| `4bc5f63c` | `kinds` on `CircularDependencyError`                  | (c)   |     88 |
| `a572179e` | `ProviderView.unresolved`                             | (c)   |     87 |
| `5c72d5b4` | `NEXUS_CORE_NOT_SHARED` for a value from another copy | (d)   |    271 |

Totals: (a) 1,518 B, (b) 507 B, (c) 842 B, (d) 271 B, together 3,138 B. Class (a) makes up
nearly half of the growth, and most of it is the load and multi-token work that the owner
approved for rc.3.

### 3.3 Core today, item by item

| Item                                                             | Class   |          Gzip B | Where it goes                          |
| ---------------------------------------------------------------- | ------- | --------------: | -------------------------------------- |
| Runtime: build, scopes, lazy, lookup, disposal, load, state      | (a)     | 10,490 prorated | core                                   |
| Compiler passes and plugin API (walk, records, bind, visibility) | (a)+(b) |  8,027 prorated | core                                   |
| Error classes, codes and `BlueprintError`                        | (b)     |    957 prorated | core                                   |
| Lifetime pass (`checkLifetimes`)                                 | (b)     |             214 | core                                   |
| Unread-contribution pass (`unread.ts`)                           | (b)     |             209 | core                                   |
| Cycle detection (`findCycles`)                                   | (b)     |              98 | core                                   |
| `Nexus.check` with `checkSchemas`                                | (c)     |             237 | `@nexusdi/core/check`                  |
| Cycle path and step kinds                                        | (c)     |             235 | path in core; kinds in `coreText` (98) |
| One-line message: fields as `key=value`                          | (c)     |       458 total | core                                   |
| of which the schema issue list                                   | (c)     |             165 | core                                   |
| of which the line-break escape                                   | (c)     |             129 | core                                   |
| of which the cause text                                          | (c)     |              88 | core                                   |
| Contribution label (`useValue #2`)                               | (c)     |             110 | core                                   |
| `describeValue` naming of tokens and modules                     | (c)     |             100 | core                                   |
| Construction-stack names in runtime error paths                  | (c)     |              64 | core                                   |
| Trace event payloads (every `tracer.emit` closure)               | (c)     |             383 | core (contribution point)              |
| `formatError` dispatch (`formatThrown`)                          | (c)     |             250 | core (contribution point)              |
| `BlueprintView` and `ProviderView` builders                      | (c)     |             236 | core (contribution point)              |
| Foreign-copy detection (`isForeign`, `notShared`)                | (d)     |              55 | core                                   |

The compiler row mixes (a) and (b) on purpose. One loop in `records.ts`, `walk.ts`,
`bind.ts` and `visibility.ts` computes what the build needs and rejects what is wrong in
the same pass. Core cannot drop the rejection without dropping the check, and D5 keeps
every check in every build.

## 4. The options

### 4.1 A plugin that writes richer messages through the error hook

This mechanism exists. `formatError` (core spec 9.1) lets `errors()` and `devtools()`
replace core's one-line message with the text of `coreText` and any other pack. D15 moved
revision 1's messages there, and core keeps codes, fields and a generic line.

What remains for this option is the data core computes for its fields. A pack receives
the error, the view and the kit, so a pack can derive any fact the view holds. Core builds
the view only when a `formatError` or `compile.check` hook is registered (`wantsView` in
`nexus.ts`), and `explain()` has one only when its caller passes it. A field moved to a pack therefore disappears from the
error of an app with no plugin.

The field data that a pack can derive from the view, measured:

- `kinds` on `CircularDependencyError`: 98 B net. The view's `edges` hold each step's kind,
  and core keeps the provider ids as a hidden `ids` field so the pack can find the edges.
- The contribution label of `NEXUS_UNREAD_CONTRIBUTION` and `NEXUS_NOT_READY`: about
  110 B. The view lacks a factory's function name, so the pack would need a new
  `ProviderView` field, which adds bytes back.
- `describeValue` naming: about 100 B. `describeValue` is a public export since rc.2, and
  the `received` field is a string, so a pack never sees the value it names.
- The cycle path: about 137 B beyond the kinds. A pack could rebuild it from the hidden
  ids, but the one-line message would then name no provider of the cycle.

Section 5 recommends the first and keeps the other three.

### 4.2 A core subpath the app imports

A subpath such as `@nexusdi/core/check` holds code that only some callers need. P5 allows
it by name ("a subpath the application opts into"), and section 2.5.9 of the extension
spec explains why a subpath suits code that must match core's exact version. A subpath
module imports core's internal files by relative path, so the main entry and the subpath
share one copy of each module in every bundler and in unbundled ESM.

`Nexus.check` is the one large item that fits. It is a static method, so every bundle
that imports `Nexus` carries it whether the app calls it or not. An app calls `create()`,
which runs the same compile. CI, tests, `inspect()` in `@nexusdi/devtools` and the CLI call
`check()`. Measured: 237 B in core, 235 B in `hono-worker`, 214 to 233 B in each adapter
fixture.

A `@nexusdi/core/diagnostics` subpath for the remaining (c) items would hold nothing. Core
calls those helpers on its own error paths, and a helper the main entry calls stays in the
main entry's graph.

### 4.3 Compact error codes with docs links

Core's message already is a code, the fields as `key=value` and the docs link. A stricter
form, `[CODE] https://nexus.js.org/errors/CODE` alone, saves 458 B. The error object keeps
its fields, but a log line that prints `error.message` loses the token, the module and the
schema issues. The schema issue list (165 B) came from fix `e2212550`, which rc.2
published. The escape (129 B) keeps a value with a line break from forging a second log
line. This proposal keeps the message as it is.

### 4.4 A lazy import inside core

P5's text forbids a dynamic import of a `@nexusdi/*` peer. A relative `import()` of a core
file sits outside that text. Two facts rule it out anyway:

- `formatError`, `check()`, `get()` and `has()` run synchronously, so the explanation
  would have to be ready before the error is thrown. The extension spec rejected the same
  design for packs ("a package dynamically importing its own `/text` on first error"),
  because a preload makes the text depend on timing.
- esbuild without `--splitting` inlines a dynamic import's target into the bundle. The
  architect measured it: a bundle of a file that imports `./lazy.js` dynamically contains
  the lazy module's text. Wrangler and the size method both bundle that way, so the
  `hono-worker` figure would not move.

### 4.5 A lean build through an export condition

A `production` or custom export condition could resolve to a core build with
`HOOK_SITES` false and every (c) item stubbed. Measured ceiling: 1,862 B in core and
1,852 B in `hono-worker`. The owner rejected a separate production build in D5, and this
build would also refuse every plugin, so `@nexusdi/testing`, `@nexusdi/errors`,
`@nexusdi/devtools` and `@nexusdi/federation` could not run on it. The fields of an error would differ between the
development and the production bundle of one app. This proposal does not recommend it.

## 5. Proposal

### 5.1 `check()` at `@nexusdi/core/check`

- `libs/core/src/check/index.ts` exports `check(root, options?)` with the overloads and
  behaviour of today's `Nexus.check`, and re-exports the `CheckOptions` and `CheckReport`
  types.
- `Nexus.check` goes. The main entry keeps exporting the two types, which add no bytes.
- `libs/core/package.json` gains the `./check` export with the `@nexusdi/source`, `types`,
  `import` and `default` conditions that `./text` has.
- `check-schemas.ts` moves under `check/`. `traceSinks` moves from `nexus.ts` to a module
  both entries import.
- The `package-imports` repo-check allows `@nexusdi/core/check` beside `@nexusdi/core` and
  `@nexusdi/core/text`. The check that a main entry never imports its own `text/` or
  `devtools/` module adds `check/`.
- `@nexusdi/devtools` (`inspect.ts`, `graph.ts`) and `@nexusdi/cli` (`graph.ts`) import
  `check` from the subpath.

P1 to P5: core still names no other package, and the subpath is core's own entry. An app
opts in with one import line, which P5 permits. No plugin hook or field changes, so
`NEXUS_PLUGIN_API` stays at 1.

What a user loses: nothing at run time. Code that calls `Nexus.check` stops compiling,
and TypeScript names the missing static, so the change surfaces before anything runs.

### 5.2 Step kinds from the view

- `compile.ts` stops calling `orderingEdgesFrom` and `stepKinds`, and passes the cycle's
  provider ids as `hidden: { ids }`. `CircularDependencyError` keeps `path`.
- `coreText`'s `circularDependency` builder reads the hidden ids and the view's `edges`,
  and picks the first non-alias step as it does today. With no view, it gives the generic
  fix for the first step, as it does today for an error with an empty `kinds`.
- `stepKinds` and `orderingEdgesFrom` move to `libs/core/src/text/`, so `@nexusdi/core/text`
  grows by about 100 B.
- The two Meridian pages that read `cycle.kinds`
  (`examples/meridian/src/errors/NEXUS_CIRCULAR_DEPENDENCY.md`,
  `examples/meridian/src/pages/multi-providers.md`) read the formatted message.

What a user loses: the one-line message of an app with no plugin no longer prints
`kinds=required,required`, and code cannot read `error.kinds`. With `errors()` or
`devtools()` registered, the message is unchanged.

### 5.3 What stays, and why

- Every (b) pass stays. "If it type-checks and starts, the wiring is right" needs the
  unread-contribution, lifetime and cycle passes, and every compiler rejection, in each
  build (D5).
- The cycle path stays. Without it the one-line message of a cycle names no provider.
- The contribution label stays. It tells two `useValue` contributions to one token apart in
  a (b) error that stops `create()`, and a pack cannot rebuild it from the view.
- `describeValue` naming stays. It is public since rc.2, and the `received` field cannot
  carry the value to a pack.
- The one-line message stays as it is (section 4.3).
- The construction-stack names stay. They tell a production log which build was running
  when `NEXUS_SCOPE_REQUIRED` or `NEXUS_REQUEST_MISSING` fired, for 64 B.
- Foreign-copy detection stays. It is 55 B, it names a common monorepo packaging
  mistake, and the brand that every copy writes has to stay in core anyway (core spec C3).
- The view builders, the `formatError` dispatch and the trace payloads stay. They are the
  contribution points of P3 (874 B measured together), and every plugin reattaches through
  them. Core would break plugin API 1 by moving them.

## 6. Savings

Measured with both moves applied together:

| Bundle           | Today B | Saved B | Saved |
| ---------------- | ------: | ------: | ----: |
| core             |  22,466 |     337 |  1.5% |
| `hono-worker`    |  32,374 |     317 |  1.0% |
| express app      |  24,451 |     313 |  1.3% |
| fastify app      |  24,788 |     310 |  1.3% |
| hono app         |  24,951 |     315 |  1.3% |
| react-router app |  24,939 |     311 |  1.2% |
| react app        |  24,009 |     342 |  1.4% |

The adapters' own figures (fixture minus core) do not change, because no adapter calls
`check()` or reads `kinds`. The saving in each app bundle comes from core.

For comparison, measured on core: all (c) and (d) items of section 4.1 and 4.2 frees
761 B, adding the issue list and the cause frees 1,004 B, and the lean build of section
4.5 frees 1,862 B. `@nexusdi/devtools` reattaches the 237 B of `check()` in an app that
imports `inspect()`.

## 7. Migration and release

0.3 users: 0.3.2 has no `check()`, so neither move touches a 0.3 migration. The 0.3
migration guide and the upgrade tooling gain nothing.

0.4-rc users: `Nexus.check` exists since rc.0. A project replaces `Nexus.check(` with
`check(` and adds `import { check } from '@nexusdi/core/check'`. TypeScript reports every
site. The repo holds 228 calls: 32 in `libs/`, 58 in the docs and Meridian pages, and the
rest in example tests and the front page's preflight bay. A scripted rewrite covers all of
them in one commit. The `kinds` field never reached npm (it came after rc.2), so no rc user
reads it.

Release: both moves fit 0.4.0-rc.3. After 0.4.0 the removal of `Nexus.check` would wait
for 0.5, and 0.4.x users would carry the 237 B for the whole line. The work is one core
task for the subpath, its export map and the repo-check, one sweep of call sites, and one
`coreText` change with its tests. The blog post of 2026-10-01 shows `Nexus.check`, so the
rc.3 notes name the new import.

## 8. Where the bytes are, for 0.5

The runtime and the compiler hold about 18.5 KB of core's 22.4 KB (section 3.3). The
feature placement table already keeps only what a pillar needs there. The lever for 0.5 is
the consolidation workstream of D5 and core spec 12.5. `records.ts` and `build.ts` are the
largest files, each about 5.8 KB minified. Consolidation keeps behaviour, so the existing
tests pin it. A plan for it should start from a per-function size trace of those two
files.

Trace payloads (383 B) could shrink in plugin API 2 if events carried ids and `observe`
read names from the view. That change breaks every observer, so it belongs with the next
plugin API.

## 9. Decisions for the owner

1. `Nexus.check` becomes `check()` at `@nexusdi/core/check`. Today every bundle that
   imports `Nexus` carries `check()` and its schema pass (237 B), though only CI, tests,
   `inspect()` and the CLI call it. Rc users change each call to
   `check(root, options)` with one import; TypeScript lists every site, and the repo has 228. 0.3 users are unaffected. This removes public API the placement table put on
   `Nexus`. Recommendation: approve for rc.3.
2. `CircularDependencyError` drops its `kinds` field, and `coreText` derives the step
   kinds from the view. The field came after rc.2, so no published version has it. An app
   with no plugin loses `kinds=...` from the cycle's one-line message and cannot read
   `error.kinds`; with `errors()` or `devtools()` the message stays the same. Core saves
   98 B. Recommendation: approve for rc.3.
3. Core's one-line message keeps its `key=value` fields, the schema issue list and the
   cause text (458 B). A message cut to `[CODE]` and the docs link would leave a production
   log without a plugin unable to say which token, module or option failed, and it would
   undo fix `e2212550` from rc.2. Recommendation: keep.
4. No lean production build. A build behind an export condition with hook sites and
   diagnostics stripped would save up to 1,862 B, but it reverses D5, refuses every
   plugin and gives one app different error fields in development and production.
   Recommendation: keep D5.
5. The 0.5 size work goes to the D5 consolidation of `records.ts` and `build.ts`, where
   about 18.5 KB sits, and starts with a per-function size trace. Recommendation: file it
   as an issue on NexusDI/core for 0.5.
