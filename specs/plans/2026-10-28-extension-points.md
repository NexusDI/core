# Extension points: implementation plan

This plan builds `specs/2026-10-28-extension-points-design.md` in four PRs into
`release/0.4`, all merged before 0.4.0-rc.3: K1 (container-wide multi tokens), K3
(`lazy(all(T))`), K2 (the unread contribution check) and K4 (the load grant). Section numbers
below name sections of that spec. The plan reads `origin/release/0.4` at `c1bd14c1`.

## 1. How the tasks run

Each task runs test first: the implementer writes the listed tests, sees them fail, then
writes the code. Sizes: S up to about 300 changed lines, M up to about 1,000, L above. Every
commit passes `lint`, `test`, `build` and `typecheck` of the projects it touches.

Each task ends with a Verify line. The implementer runs it before the commit, with
`NX_NO_CLOUD=true NX_DAEMON=false` in front of each `nx` call. A Verify line that builds
`@nexusdi/docs` or runs an `e2e` target runs under the heavy-job lock (`until mkdir
/tmp/nexusdi-heavy.lock; do sleep 30; done`, then `rmdir /tmp/nexusdi-heavy.lock`) with
`--parallel=2`. The lines use these project sets:

- `core`: `@nexusdi/core`
- `errs`: `@nexusdi/errors`
- `testing`: `@nexusdi/testing` and `@nexusdi/vitest`
- `deco`: `@nexusdi/decorators`
- `ic`: `@nexusdi/interceptors`
- `tools`: `@nexusdi/devtools` and `@nexusdi/cli`
- `adapters`: `@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/hono` and
  `@nexusdi/react-router`
- `react`: `@nexusdi/react`
- `docs`: `@nexusdi/docs` and `@nexusdi/meridian`
- `repo`: `@nexusdi/repo-checks`

Two shorthands name the commands:

- `checks(core, errs)` stands for `npx nx run-many -t lint test build typecheck -p <projects>`
  over the projects of `core` and `errs`.
- `gate` stands for `npx nx run-many -t lint test build typecheck --exclude=tag:demo-frontend`,
  the command CI's main job runs, then `npx prettier --check .`. Each PR's last task runs it.

A docs task follows the `docs-page` skill: it builds `@nexusdi/core` first, runs
`@nexusdi/docs:behaviour-data` after a test rename, and fills every new export's four
requirements (docblock, `describe`, heading with a `reference` directive, example region).

Commit messages follow conventional commits. A task that changes behaviour a user sees
commits as `feat(core)!:` or `fix(<pkg>)!:` with a `BREAKING CHANGE:` footer, so `nx release
changelog` lists it under "Breaking Changes" in the rc.3 notes. The footer is the release
note; the repo has no changeset files.

## 2. Tasks

### PR K1: container-wide multi tokens (M)

K1.1. The visibility rule (M, no deps)

- Scope: section 4.1, 4.2 and 4.4. The oracle first: `test-support/visibility-oracle.ts`
  models a multi token as the module's own records plus every module's published records,
  sorted by record index. Then the pass: `published` per token, the multi branch of
  `lookup`, multi tokens out of `exported[]`, `open()` and `settle`, `moduleExports` and
  `exportedTokens` from the published set, and the `NEXUS_INVALID_EXPORT` loop
  (`visibility.ts:222-235`) skipping multi tokens. The docblock of `computeVisibility`
  states the rule.
- Files: `libs/core/test-support/visibility-oracle.ts`,
  `libs/core/src/blueprint/visibility.oracle.test.ts`, `libs/core/src/blueprint/visibility.ts`,
  `libs/core/src/blueprint/visibility.test.ts`, and every test that asserts import-scoped
  collection: `libs/core/src/runtime/nexus.test.ts`, `libs/testing/src/index.test.ts`,
  `libs/react/src/{plugin,use-service,scope-provider}.test.tsx`,
  `libs/errors/test-support/message-scenarios.ts`. The implementer greps `MultiToken` and
  `all(` under `libs/*/src` and `libs/*/test-support` and lists each file it changed in the
  commit message.
- Tests first: the oracle cases fail against today's pass. `visibility.test.ts:135` becomes
  the walk-order rule of section 4.2, with a module first met through another path.
  `visibility.test.ts:236` becomes "every module of a re-export cycle a global closes sees
  the published set". New cases: a library collector sees a downstream contributor; a
  private record stays inside its module; `exports: [T]` with no own record is accepted and
  adds nothing; a module re-export publishes nothing of T; a plugin module's exported record
  reaches a collector; two collectors in two modules see one list; a singleton collector
  over a far scoped contribution fails with `NEXUS_LIFETIME_VIOLATION`; a collector and a
  contributor that depends on it fail with `NEXUS_CIRCULAR_DEPENDENCY`; a pinned override
  from `@nexusdi/testing` still resolves to its one record everywhere.
- Commit: `feat(core)!: collect multi tokens across the container`, with a `BREAKING CHANGE:`
  footer stating the three points of section 4.1.
- Verify: `checks(core, testing, react, errs)`.

K1.2. The load guard (S, after K1.1)

- Scope: section 4.5. `LoadContributionError` (`NEXUS_LOAD_CONTRIBUTION`, fields `module`,
  `token`), the guard in `compile()` after `rewriteProviders` and before pass 2, skipping
  pinned tokens, and `isLoadError` used by `Nexus.check` in place of the `instanceof
LoadError` test at `nexus.ts:106`. The text and the fix of section 4.5 in `core-text.ts`.
- Files: `libs/core/src/errors/load-contribution-error.ts` (new),
  `libs/core/src/errors/{index.ts,is-nexus-error.ts}`, `libs/core/src/blueprint/compile.ts`,
  `libs/core/src/runtime/nexus.ts`, `libs/core/src/text/core-text.ts`, `libs/core/src/index.ts`,
  `libs/core/test-support/error-cases.ts`, `libs/errors/test-support/error-cases.ts`,
  `libs/errors/src/parity/__snapshots__/messages.test.ts.snap`,
  `libs/core/src/runtime/{load,check}.test.ts`, `libs/core/src/errors/errors.test.ts`.
- Tests first: `load()` of a module that exports a contribution throws
  `NEXUS_LOAD_CONTRIBUTION` directly, names the module and the token, and leaves the
  container as it was; `Nexus.check({ load })` reports it inside `BlueprintError`; a loaded
  module with a private contribution and a same-module reader loads; a `compile.provider`
  hook that removes the record lets the load through; a pinned token is skipped; the parity
  snapshot holds the new text.
- Verify: `checks(core, errs)`.

K1.3. K1 docs (M, after K1.2)

- Scope: section 9 for K1. `multi-providers.mdx`: "Publishing Contributions" with the
  library-owned extension point example (`MultiToken<IHealthCheck>`, contributors bound with
  `useClass`, a `HealthService` in the library's module), the three statements of section
  4.1 and the ordering sentence of section 4.2 at line 22. `load.mdx`: the contribution rule
  under "Design Constraints", pointing at an `onInit` registry. The error page and its
  example.
- Files: `apps/docs/content/multi-providers.mdx`, `examples/meridian/src/pages/multi-providers.md`,
  `apps/docs/content/load.mdx`, `examples/meridian/src/pages/load.md`,
  `apps/docs/content/errors/NEXUS_LOAD_CONTRIBUTION.mdx` (new),
  `examples/meridian/src/errors/NEXUS_LOAD_CONTRIBUTION.md` (new),
  `apps/docs/content/errors/_meta.ts`, `apps/docs/content/api-errors.mdx`.
- Tests first: the new regions carry `// ->` claims that fail against the old pages'
  wording, and the `doc-behaviour-render` repo-check lists the new error.
- Verify: `checks(docs, repo)`, then `gate`.

### PR K3: `lazy(all(T))` (M, after K1)

K3.1. The modifier and its types (S, no deps inside the PR)

- Scope: section 5.2. `LazyAll<T>`, the `lazy` overload, `Modifier`, `Dep`, `Resolve`, the
  `DepFor` arm, and `depOf` accepting `lazy-all` with a `MultiToken`. `LazyAll` is exported
  from `@nexusdi/core` as a type.
- Files: `libs/core/src/definitions/modifiers.ts`, `libs/core/src/blueprint/records.ts`,
  `libs/core/src/blueprint/blueprint.ts` (`DepKind` gains `lazy-all`; `EdgeKind` becomes the
  explicit union of section 5.3), `libs/core/src/index.ts`,
  `libs/core/src/definitions/{modifiers.test-d.ts,modifiers.test.ts,static-deps.test-d.ts}`,
  `libs/decorators/src/decorators.test-d.ts`.
- Tests first: a constructor parameter `() => IPowerConsumer[]` takes
  `lazy(all(POWER_CONSUMERS))`; `IPowerConsumer[]` does not; `lazy(MULTI)` and
  `optional(all(MULTI))` stay type errors and stay `NEXUS_INVALID_PROVIDER` at runtime;
  `@Inject(lazy(all(T)))` accepts a `() => T[]` accessor; `lazy()` of a plain value stays
  `bad-modifier`.
- Verify: `checks(core, deco)`.

K3.2. Bind, build and the thunk (M, after K3.1)

- Scope: sections 5.3 and 5.4. `bind` records one `lazy` edge per contribution with
  `written` set to the multi token. The all-or-nothing thunk in `runtime/lazy.ts`. The
  `lazy-all` case in `build.ts:175`. `resolve()` per id with the `needsScopeAtRoot` rule
  (`deps.ts:177-181`), and `validate()` treating `lazy-all` as `all` (`deps.ts:216`).
- Files: `libs/core/src/blueprint/bind.ts`, `libs/core/src/runtime/{lazy.ts,build.ts,deps.ts}`,
  `libs/core/src/runtime/{lazy.test.ts,deps.test.ts}`, `libs/core/src/blueprint/{bind.test.ts,views.test.ts}`,
  `libs/interceptors/src/check.test.ts`.
- Tests first: a cycle through `all(T)` fails with `NEXUS_CIRCULAR_DEPENDENCY` and the same
  cycle through `lazy(all(T))` builds; the thunk returns the contributions in record order and
  a new array per call; a transient contribution builds per call; the thunk called in the
  collector's constructor throws `NEXUS_NOT_READY` naming the first unready contribution and
  builds none; a collector's `[Symbol.asyncDispose]()` that calls the thunk meets
  `NEXUS_DISPOSED`; a singleton collector over a scoped contribution through `lazy(all)` fails
  with `NEXUS_LIFETIME_VIOLATION`; `graph()` shows one `lazy` edge per contribution with
  `ordersBuild: false` and `written` set to the multi token; `resolve({ x: lazy(all(T)) })`
  at the root with a scoped contribution resolves the list at once; `validate()` accepts an
  empty `lazy(all(T))`; interceptors: a collector reaches its contributions through `all` and
  through `lazy` edges in `reach()`, and the R11 exemption follows them.
- Verify: `checks(core, ic, tools)`.

K3.3. K3 docs (S, after K3.2)

- Scope: section 9 for K3. `lazy.mdx` gains "Collectors Their Contributors Call", with the
  all-or-nothing thunk and `NEXUS_DISPOSED` from a dispose method. `multi-providers.mdx`
  replaces "`all()` is the only modifier a multi-token takes" with the rule of section 5.2
  and shows `lazy(all())` on a bus whose handlers publish.
- Files: `apps/docs/content/lazy.mdx`, `examples/meridian/src/pages/lazy.md`,
  `apps/docs/content/multi-providers.mdx`, `examples/meridian/src/pages/multi-providers.md`.
- Tests first: the regions' `// ->` claims.
- Verify: `checks(docs, repo)`, then `gate`.

### PR K2: the unread contribution check (S, after K3)

K2.1. The check (S, no deps inside the PR)

- Scope: sections 6.1 and 6.2. `UnreadContributionError` (`NEXUS_UNREAD_CONTRIBUTION`,
  fields `token`, `module`, `provider`), a pass after `bind` in `compile()` that reads the
  bindings (`all` and `lazy-all` both count), and the text and fix order of section 6.2. The
  comments on `LookupOptions.module` (`runtime/options.ts`) and `visible()`
  (`blueprint/views.ts:33`) say neither counts as a reader.
- Files: `libs/core/src/blueprint/unread.ts` (new) and `unread.test.ts` (new),
  `libs/core/src/blueprint/compile.ts`, `libs/core/src/errors/unread-contribution-error.ts`
  (new), `libs/core/src/errors/{index.ts,is-nexus-error.ts}`, `libs/core/src/text/core-text.ts`,
  `libs/core/src/index.ts`, `libs/core/src/runtime/options.ts`,
  `libs/core/src/blueprint/views.ts`, both `test-support/error-cases.ts`, the parity snapshot.
  The implementer greps `libs/` and `examples/` for private contributions without a reader
  and lists each one it fixed in the commit message.
- Tests first: a private contribution in a feature module with no reader fails; with an
  `all()` reader in the module it passes; with a `lazy(all())` reader it passes; in the root
  it passes; exported it passes; pinned by the testing plugin it passes; a reader through a
  property passes; a loaded module with an unread private contribution fails `load()` and
  `Nexus.check({ load })` inside `BlueprintError`; two unread records give two errors in
  record order.
- Commit: `feat(core)!: reject a contribution no provider can read`, with a `BREAKING CHANGE:`
  footer naming the `get(T, { module })` case of section 6.4.
- Verify: `checks(core, errs, testing, react)`.

K2.2. K2 docs (S, after K2.1)

- Scope: the error page and its example; the `unexported` region of the multi-providers page
  becomes the error's teaching case; the `{ module }` paragraph of `modules.mdx:25` gains the
  reader sentence.
- Files: `apps/docs/content/errors/NEXUS_UNREAD_CONTRIBUTION.mdx` (new),
  `examples/meridian/src/errors/NEXUS_UNREAD_CONTRIBUTION.md` (new),
  `apps/docs/content/errors/_meta.ts`, `apps/docs/content/api-errors.mdx`,
  `apps/docs/content/multi-providers.mdx`, `examples/meridian/src/pages/multi-providers.md`,
  `apps/docs/content/modules.mdx`.
- Tests first: the `unexported` region's claim prints `NEXUS_UNREAD_CONTRIBUTION`.
- Verify: `checks(docs, repo)`, then `gate`.

### PR K4: the load grant (L, after K1, merged last)

K4.1. The grant in core (M, no deps inside the PR)

- Scope: sections 7.2 to 7.5 in core. `LoadOptions`, `LoadEntry`, `load(module, options?)`,
  `CheckOptions.load` as `LoadEntry[]`, `Blueprint.extraImports` as `LoadEntry[]`, the walk
  passing a grant to every node it creates under a granted entry, the grant checks next to
  `checkNewGlobals`, `ModuleNode.grants` and `ModuleView.grants`, the repeat rule in
  `loadNow`, `LoadGrantError` (`NEXUS_LOAD_GRANT`, reasons `not-in-graph`, `root`,
  `already-loaded`), and `isLoadError` covering it.
- Files: `libs/core/src/runtime/{options.ts,nexus.ts,load.ts}`,
  `libs/core/src/blueprint/{walk.ts,compile.ts,blueprint.ts,views.ts}`,
  `libs/core/src/errors/load-grant-error.ts` (new), `libs/core/src/errors/{index.ts,is-nexus-error.ts}`,
  `libs/core/src/text/core-text.ts`, `libs/core/src/index.ts`, both
  `test-support/error-cases.ts`, the parity snapshot,
  `libs/core/src/runtime/{load.test.ts,check.test.ts,nexus.test-d.ts}`,
  `libs/core/src/blueprint/{walk.test.ts,views.test.ts}`.
- Tests first: a granted module's export resolves in the loaded module and in a new module
  of its subtree; a granted module's private provider does not
  (`NEXUS_MISSING_PROVIDER`); a module the graph already held gets nothing from the grant; a
  fresh `forRoot()` fails `not-in-graph`; the root fails `root`; a global is accepted and adds
  nothing; a repeat with the same set (another order) is a no-op and builds once; a repeat
  without options is a no-op; a repeat with another set fails `already-loaded`; a grant for a
  statically imported module fails `already-loaded`; a later load leaves an earlier grant as
  it is; `NEXUS_LOAD_GLOBAL_MODULE` and `NEXUS_LOAD_CONTRIBUTION` still fire with a grant;
  `Nexus.check({ load: [{ module, imports }] })` reports each error inside `BlueprintError`;
  `graph()` lists `grants` on the loaded module; type tests for `LoadOptions` and `LoadEntry`.
- Verify: `checks(core, errs)`.

K4.2. One load helper for the adapters (M, after K4.1)

- Scope: section 7.5, last point. `loadOnce(container)` in `@nexusdi/core`, keyed on the
  module and its granted set, sharing the pending promise and forgetting a failed load. The
  four `loader()` copies (`request-scope.ts:290-303`) go, and each adapter's
  `di.load(module, options?)` passes the grant. `lazySection(name, loader, options?)` in
  `@nexusdi/react`. The devtools startup profile takes `LoadEntry`.
- Files: `libs/core/src/runtime/load-once.ts` (new) and its test, `libs/core/src/index.ts`,
  `libs/{express,fastify,hono,react-router}/src/internal/request-scope.ts`,
  `libs/{express,fastify,hono,react-router}/src/nexus.ts` and their tests,
  `libs/react/src/section.tsx` and its test, `libs/devtools/src/profile/startup.ts` and
  `startup.test.ts`.
- Tests first: `loadOnce` calls `load()` once per module and grant set, shares the promise,
  and retries after a failure; per adapter, a section middleware with a grant loads once and
  its handler resolves a granted token; `lazySection` with a grant renders a component that
  reads a granted token; the startup profile loads a `LoadEntry` with a grant.
- Verify: `checks(core, adapters, react, tools)`.

K4.3. Graph consumers (S, after K4.1)

- Scope: `grants` in the graph JSON. `graphOf` copies it, `parse-graph.ts` reads it with the
  `imports` rules (`parse-graph.ts:109,164`), and the renderers draw a grant as a dashed
  import. The cli fixture gains a granted module.
- Files: `libs/devtools/src/{graph.ts,parse-graph.ts}` and their tests, the devtools
  renderers under `libs/devtools/src/render/`, `libs/cli/test-fixtures/json/graph.json` and the
  cli tests that read it.
- Tests first: `parse-graph` rejects a `grants` entry that names no module and accepts a
  valid one; `toMermaid` and `toDot` draw the grant.
- Verify: `checks(tools)`.

K4.4. K4 docs (M, after K4.2 and K4.3)

- Scope: section 9 for K4. `load.mdx` gains "Granting Host Modules to a Loaded Module", with
  the sentence that a grant is no isolation and no security boundary. `federation.mdx` loads
  the section with the grant, and `Tactical` loses `global: true`; the "delete `global:
true`" Try-it becomes "delete the grant". `modules.mdx`'s global section points hosts at
  grants. The adapter pages and `react.mdx` show the option. The reference headings for
  `loadOnce`, `LoadOptions` and `LoadEntry`. The error page and its example.
- Files: `apps/docs/content/{load,federation,modules,express,fastify,hono,react-router-ssr,react,api}.mdx`,
  `examples/meridian/src/pages/{load,federation}.md`, `libs/core/docs/modules.md` for the
  `loadOnce` example region, `apps/docs/content/errors/NEXUS_LOAD_GRANT.mdx` (new),
  `examples/meridian/src/errors/NEXUS_LOAD_GRANT.md` (new), `apps/docs/content/errors/_meta.ts`,
  `apps/docs/content/api-errors.mdx`.
- Tests first: the regions' `// ->` claims, and the `doc-export-coverage` guard for the new
  exports.
- Verify: `checks(docs, repo)`, then `gate`.

## 3. Order and size

| PR  | Tasks         | Sizes    | Commits, estimated | Starts after           |
| --- | ------------- | -------- | ------------------ | ---------------------- |
| K1  | K1.1 to K1.3  | 1 S, 2 M | 9                  | none                   |
| K3  | K3.1 to K3.3  | 2 S, 1 M | 9                  | K1 merged              |
| K2  | K2.1 and K2.2 | 2 S      | 6                  | K3 merged              |
| K4  | K4.1 to K4.4  | 1 S, 3 M | 12                 | K1 merged; merges last |

K4 runs in parallel with K3 and K2 and rebases on them before it merges. Weekdays allow one
heavy gate at a time, so the `gate` runs queue on the heavy-job lock. The commit counts
include a fix-up per review round, folded into the task commit before the PR merges.

The demo refactor (`specs/plans/2026-10-28-demo-refactor.md`) runs alongside: its PR 1 needs
none of these. Its T17 starts after K1, K3 and K2 merge, and its T17b after K4.

## 4. Reviews

Each task gets a reviewer, and each PR an independent opus final review. The K1.1 reviewer
checks the rewritten oracle against section 4.1 before reading the pass. A PR merges into
`release/0.4` with `gh pr merge --rebase` once it is reviewed and CI is green.
