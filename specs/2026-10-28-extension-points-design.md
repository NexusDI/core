# Extension points and load grants

Status: approved, 2026-10-28. The owner ruled on scope and defaults on 2026-10-28 (section
11). An opus architect wrote the design, and the tech lead reviewed it twice and ruled
every spec-internal point (section 12). The plan is
`specs/plans/2026-10-28-extension-points.md`.

Packages changed: `@nexusdi/core`, `@nexusdi/errors`, `@nexusdi/devtools`, `@nexusdi/cli`,
`@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/hono`, `@nexusdi/react-router` and
`@nexusdi/react`. Tests change in `@nexusdi/interceptors`, `@nexusdi/testing` and
`@nexusdi/decorators`. Every change goes into 0.4.0-rc.3.

Depends on:

- The code on `origin/release/0.4` at `c1bd14c1`. Every file and line cited below was read
  there.
- `specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`
  (P1 to P5). Section 8 applies P2 and P4.
- `specs/plans/2026-10-28-demo-refactor.md`, which this spec amends (section 10).

## 1. Problem

A user builds an extension point with a `MultiToken`: a health check registry, an HTTP
route list, a CLI command table, an event bus. The module that owns the collector sits
upstream. The contributors import it, because they need its token and often its
services. Core makes contributions flow the other way.

`blueprint/visibility.ts` (`computeVisibility`) gives a module three sources: its own
records, the exports of its imports (following module re-exports), and the exports of every
global module. `all(T)` in a module reads the contributions from those sources and nothing
else. So:

- A library cannot own a collector. `HealthModule` cannot hold a `HealthService` that reads
  `all(HEALTH_CHECKS)`, because the library cannot import the app's modules.
- The workaround is a global module that imports every contributor and re-exports the
  token. Each app has to write it, and the modules page reserves globals for providers no
  module owns (`apps/docs/content/modules.mdx:63`).
- A middle module that imports a contributor and forgets to re-export the token drops the
  contribution. The app type-checks, starts, and runs without it. The positioning claim,
  "if it type-checks and the container starts, the wiring is right", fails.
- A contributor that calls back into its collector forms a module import cycle, which
  `walk.ts` rejects with `NEXUS_MODULE_IMPORT_CYCLE`.

The demo apps hit all four: the power router in `Engineering` collects consumers from
`Weapons`, which imports `Engineering` to call the router. The demo is one test case of the
gap. The design below stands on the user cases above.

A second gap: a module that `load()` adds sees its own imports and the globals
(`apps/docs/content/load.mdx`, "Validation and Safety"). A host that loads a module which
cannot name the host's modules (a federation remote, a plugin package loaded at runtime)
must make every host service global. The federation shell's `Tactical`
(`examples/federation-shell/src/ship/tactical.ts:28`) is global for that reason.

## 2. Prior art

- Angular flattens the providers of every eagerly imported NgModule into one injector:
  "ModuleInjector is a flattening of all the providers arrays that can be reached by
  following the NgModule.imports". A root collector sees every eager contribution. A lazy
  route gets a child injector that sees its parent.
  https://angular.dev/guide/di/hierarchical-dependency-injection
- Dagger collects a multibinding from every module installed in the component. A
  subcomponent adds to its parent's set, and the parent's own bindings see only the
  parent's contributions. https://dagger.dev/dev-guide/multibindings.html
- NestJS encapsulates modules and has no multi providers. Plugin packages find handlers
  with `DiscoveryService`, which scans providers across the application, and `include`
  narrows the scan. A module that `LazyModuleLoader` loads sees its own imports and the
  globals. https://docs.nestjs.com/fundamentals/discovery-service
- InversifyJS, tsyringe, .NET and Spring are flat containers, so a collection resolves every
  registration.

Every container with collections collects at the container or component level. NexusDI
0.4.0-rc.2 is the only one that scopes a collection to the importer chain.

## 3. Overview

Four changes, each its own PR:

| PR  | Change                                                                                     | Section |
| --- | ------------------------------------------------------------------------------------------ | ------- |
| K1  | every multi token collects across the container; `load()` rejects a published contribution | 4       |
| K3  | `lazy(all(T))` breaks a collector's cycle once for every contributor                       | 5       |
| K2  | compile rejects a private contribution that nothing can read                               | 6       |
| K4  | `load(module, { imports })` grants a loaded module the exports of host modules             | 7       |

The order is K1, K3, K2, with K4 after K1 in parallel and merged last before rc.3. Plain
tokens keep today's import rule in every change.

## 4. K1: container-wide multi tokens

### 4.1 Rule

For a `MultiToken` T and a module M:

- M's published set of T holds M's own records of T when M's `exports` names T, and is
  empty otherwise. A module re-export (`exports: [OtherModule]`) publishes nothing of T.
  Each module publishes its own records.
- M's view of T holds M's own records of T plus every module's published set, sorted by
  record index, with duplicate ids dropped.

`exports: [T]` in a module with no own record of T is legal and does nothing. Under rc.2
such a module passed its imports' contributions along. Under K1 they reach every collector
already. The export never raises `NEXUS_INVALID_EXPORT`.

What changes for a reader of `all()`:

- Only same-module privacy remains. A contribution that its module does not export is read
  inside that module, and by root `get()` when the module is the root.
- Two collectors of one token in two modules see one list, apart from each one's own
  private records.
- A plugin module's exported contributions (`NexusPlugin.modules`) reach every collector,
  as any other module's do.

### 4.2 Ordering

A record's index is the order in which the walk first visits its module, then the order of
the module's `providers` list. The walk (`walk.ts`, `visit`) goes depth first from the root,
follows each module's `imports` in order, and walks the plugin modules and the loaded
modules after the root's own imports. A private record of the collector's module sorts in by
its index too.

`apps/docs/content/multi-providers.mdx:22` says "a module's own contributions come first,
then those of its imports in import order". That is wrong today for a module the walk met
first through another path, and wrong under K1 for most collectors. The new sentence:
"`all()` lists the contributions in the order the walk first meets their modules, starting
at the root and following each module's `imports` in order, and within a module in
`providers` order."

### 4.3 Semantics

- Duplicates: a module imported along several paths is one node and contributes once. Two
  `forRoot` results are two nodes and contribute twice.
- Lifetimes: pass 5 (`lifetimes.ts`, `checkLifetimes`) follows every edge, so a singleton
  collector over a scoped contribution anywhere in the graph fails with
  `NEXUS_LIFETIME_VIOLATION`.
- Cycles: a collector and a contributor that depends on it form a provider cycle. Pass 4
  reports it as `NEXUS_CIRCULAR_DEPENDENCY` with the path. `lazy()` on the contributor, or
  `lazy(all(T))` on the collector (section 5), breaks it. Module imports stay acyclic.
- Testing: the testing plugin pins a multi token override with `{ with, pin: true }` at
  create, and at a load only for a token it pinned at create. A token a load first adds is
  rewritten record by record without a pin (`libs/testing/src/plugin.ts`). A pinned token
  resolves to one record in every module, and the load guard of section 4.5 treats the pin
  as a publish.
- `graph()`: `bind` already records an `all` edge from the collector to each contribution.
  The view's module `exports` lists show published records.

### 4.4 Implementation

The pass keeps a module's view of a multi token apart from what it publishes.

- `computeVisibility` builds `published: Map<TokenKey, string[]>` once: a record of a
  `MultiToken` goes in when its module's `exportTokens` names its token.
- `lookup(i, T)` for a multi token returns `sorted([...(own[i].get(T) ?? []), ...(published.get(T) ?? [])])`.
- Multi tokens leave `exported[]`, `open()` and `settle`. The cycle solver then handles plain
  tokens alone.
- `moduleExports` and `exportedTokens` read a multi token from M's published set. A pinned
  multi token is listed only under the module that owns the pinned record.
- The `NEXUS_INVALID_EXPORT` loop (`visibility.ts:222-235`) skips multi tokens.

### 4.5 The load guard

Today a loaded module that exports a contribution changes the root's `all(T)`, while
collectors built before the load keep their arrays. No error guards it. The owner ruled
that `load()` must not extend multi tokens, and K1 makes core enforce it.

In `compile()`, when `previous` is set, after `rewriteProviders` and before pass 2, the
compile looks for the first record by index that:

- is a record of a `MultiToken` that this compile publishes (its module's `exportTokens`
  names the token, or a `compile.provider` hook pins it),
- and that the previous blueprint did not publish under the same id, module and token.

It throws `LoadContributionError`, code `NEXUS_LOAD_CONTRIBUTION`, fields `module` and
`token`. The guard runs after the `compile.provider` hooks, so a record a hook removes is
not checked. A hook that pins at the load the same record it pinned at create passes,
since the pin drops every other record of the token. A pin first made at a load is
checked like any record (#230). A loaded module's private contributions stay legal,
subject to K2.

- `nexus.ts:108` wraps a thrown `LoadError` in `BlueprintError` for `Nexus.check`. One helper,
  `isLoadError(error)`, covers `LoadError`, `LoadContributionError` and K4's
  `LoadGrantError`, and `Nexus.check` wraps each.
- `errors/is-nexus-error.ts` maps the code to its class, and `NexusErrorCode` (`errors/codes.ts`) derives from that map.
- `text/core-text.ts` gives the text: "`<module>` publishes a contribution to `<token>`, and
  `load()` cannot add to a multi token: collectors built at startup hold their lists." The
  fix: "Drop the contribution from `<module>` and register the provider from its `onInit`
  through the collector's registry, and unregister it on dispose."
- `apps/docs/content/errors/NEXUS_LOAD_CONTRIBUTION.mdx` and
  `examples/meridian/src/errors/NEXUS_LOAD_CONTRIBUTION.md` are new.

### 4.6 Users

0.3 has no multi tokens (`libs/core/src/container.ts` at `@nexusdi/core@0.3.2`), so 0.3
users are unaffected. An rc.2 app sees more entries in a collector away from the root, may
see another order, and may fail at startup with a lifetime or cycle error that the old rule
hid. Each failure is a typed compile error naming its providers. The owner ruled that rc
users are not a constraint. The rc.3 release note states the three points of section 4.1.

## 5. K3: `lazy(all(T))`

### 5.1 Need

A bus whose contributors call back into it: an event bus whose handlers publish, a command
desk whose handlers queue, a power router whose consumers divert. Under K1 each is a
provider cycle. Without K3 every contributor writes `lazy(BUS)`, so a library that owns the
bus documents a rule every third-party contributor must follow. A contributor that forgets
it meets `NEXUS_CIRCULAR_DEPENDENCY` from a bus it did not write. K3 lets the collector break
the cycle once.

### 5.2 Spelling and types

`lazy(all(T))` composes the two modifiers readers already know. `lazy(T)` of a bare
`MultiToken` and `optional(all(T))` stay invalid.

- `definitions/modifiers.ts`: a modifier `LazyAll<out T> { readonly kind: 'lazy-all';
readonly token: MultiToken<T> }`. `lazy` gains an overload `lazy<T>(dep: All<T>):
LazyAll<T>`. `Modifier` and `Dep` gain `LazyAll<unknown>`.
- `Resolve<LazyAll<T>>` is `() => T[]`. `DepFor<P>` gains the arm
  `(P extends () => readonly (infer E)[] ? LazyAll<E> : never)`, so a parameter
  `() => IPowerConsumer[]` takes `lazy(all(POWER_CONSUMERS))`, and `IPowerConsumer[]` does
  not.
- `blueprint/records.ts`: `depOf` accepts `lazy-all` and requires a `MultiToken` for it (the
  check at line 295). `lazy()` of a value that is neither a token nor an `all()` stays
  `bad-modifier`.
- `@Inject` in `@nexusdi/decorators` takes a `Dep`, so it accepts `lazy(all(T))` with no
  change beyond a type test.

### 5.3 Static graph

`lazy-all` is an internal `DepKind` only. `bind` records one edge per contribution with kind
`lazy` and `written` set to the multi token. `EdgeKind` becomes the explicit union
`'required' | 'optional' | 'lazy' | 'all' | 'alias'` (`blueprint/blueprint.ts:18` derives it
from `DepKind` today), so `BlueprintView` edge kinds, `libs/devtools/src/graph.ts:66` and
`EDGE_KINDS` in `libs/devtools/src/parse-graph.ts:9` do not change. `ordersBuild` stays
`kind !== 'lazy'`, so pass 4 and the build levels skip the edges. Pass 5 follows every edge,
so a singleton collector still cannot reach a scoped contribution.

`libs/interceptors/src/check.ts` `reach()` follows edges of every kind, and the R11 exemption
closure widens under K1 and K3. The interceptors suite gains cases for a collector that
reaches contributions through `all` and through `lazy`.

### 5.4 Runtime

The thunk is all or nothing. On each call it first checks every id of the binding: a
singleton must be ready, or a deferred one buildable, as `resolveLazy` decides in
`runtime/lazy.ts`. If one is not, the thunk throws `NEXUS_NOT_READY` naming that contribution
and builds nothing. Then it resolves each id through `resolveLazy` and returns a new array.
A singleton contribution gives its one instance, and a transient one builds per call, as
`lazy(T)` does today. A thunk called after disposal of a contribution throws
`NEXUS_DISPOSED`. A collector's `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` that calls
the thunk meets it, since disposal runs in reverse creation order. The docs say so.

`resolve()` and `validate()` (`runtime/deps.ts`) handle `lazy-all` per id. `resolve()` at the
root resolves the ids at once when one of them needs a scope, as the `needsScopeAtRoot`
branch of the `lazy` case does (`deps.ts:177-181`), and makes the thunk otherwise.
`validate()` treats `lazy-all` as it treats `all` (`deps.ts:216`): an empty list is valid.
`build.ts:175` gains the `lazy-all` case.

The list is fixed at compile time, and `load()` never adds to it (section 4.5).

## 6. K2: the unread contribution check

### 6.1 Readers

After K1, a record r of multi token T in module M is read by:

1. every `all(T)` and `lazy(all(T))` in the graph, when M publishes T;
2. an `all(T)` or `lazy(all(T))` binding of a provider in M, when M keeps r private;
3. root `get(T)`, `resolve()` and `validate()`, and a scope's `get(T)`, when M is the root.

`get(T, { module: M })`, the same option on `has()`, `resolve()` and `validate()`, and a
plugin's `view.visible(M, T)` can also see r. They do not count as readers. A compile cannot
know whether any such call exists, and both are meant for tests and debugging
(`modules.mdx:25`). A private record in a non-root module with no reader in M is dead
wiring. A forgotten `exports: [T]` is the likely cause.

### 6.2 Rule

After pass 3 (`bind`), the compile raises `UnreadContributionError`, code
`NEXUS_UNREAD_CONTRIBUTION`, fields `token`, `module` and `provider`, for each record r of a
`MultiToken` T in module M where:

- M is not the root module,
- M does not export T,
- no provider of M binds T through `all` or `lazy(all)`, in its deps or its properties,
- T is not pinned.

A provider of M reads T when its record binds T through all() or lazy(all()), either as written or as the compile.provider hooks return it. The check runs over the records the hooks return, so a contribution a hook removes is not checked and a pinned token is skipped.

The errors go into the `BlueprintError` list after pass 3's errors, in record order.
`Nexus.create`, `load()` and `Nexus.check` raise them, since all three compile. A loaded
module is an import of the root and not the root, so the rule applies to it.

The text: "`<provider>` contributes to `<token>` in `<module>`, and no provider can read it."
The fix, in this order: "Collect it in `<module>` with `all(<token>)`. Or add `<token>` to
the exports of `<module>` to publish it to every collector. Or remove the contribution."

`modules.mdx` (the `{ module }` paragraph at line 25) and the `LookupOptions.module` comment
in `runtime/options.ts` gain a sentence: the option does not count as a reader of a private
contribution. The `visible()` comment in `blueprint/views.ts:33` says the same.

### 6.3 Where it lives

NexusDI has no warning channel. Compile errors aggregate into `BlueprintError`, and nothing
else reaches a user at startup. A devtools lint runs only for users who install devtools. A
contribution that nothing can read is wrong wiring that starts, so the check is a compile
error. It reads the bindings pass 3 already made and adds no runtime work.

### 6.4 Users

A program whose only reader of a private contribution is `get(T, { module: M })` fails at
startup. The fix is one line. No code in `libs/` or `examples/` does this (the K2 tasks grep
both). The multi-providers page's `unexported` region
(`examples/meridian/src/pages/multi-providers.md`) becomes the error's teaching case.

## 7. K4: the load grant

### 7.1 Need

A host loads a module that cannot name the host's modules: a federation remote, a plugin
package that a CLI or a server loads at runtime, an extension in a dashboard. The loaded
module needs host services. Today the host makes those services global, so every host module
and every loaded module sees them. A grant names, per load, the host modules a loaded module
sees. A lazy feature in the host's own codebase needs no grant, since it imports the host
module by name.

A grant is wiring. The docs never present it as isolation or a security boundary: a loaded
module runs in the host's process and can reach anything the host's code can.

### 7.2 API

```ts
/** The options load() takes. */
interface LoadOptions {
  /** Modules of the graph whose exports the modules this load adds see, as if they imported them. */
  readonly imports?: readonly ModuleRef[];
}

load(module: ModuleRef, options?: LoadOptions): Promise<void>;

/** A module for Nexus.check to load, with its grant. */
type LoadEntry =
  | ModuleRef
  | { readonly module: ModuleRef; readonly imports: readonly ModuleRef[] };

interface CheckOptions {
  readonly plugins?: readonly NexusPlugin[];
  readonly load?: readonly LoadEntry[];
}
```

The adapters pass the option through: `di.load(module, options?)` in express, fastify, hono
and react-router, and `lazySection(name, loader, options?)` in `@nexusdi/react`.
`@nexusdi/devtools`' startup profile takes `LoadEntry` in its `load` list
(`libs/devtools/src/profile/startup.ts:32`).

### 7.3 Semantics

- A grant applies to every module the load adds to the graph: the loaded module and each
  module of its subtree that the graph did not hold before. Each such module sees each
  granted module's exports (following re-exports) as if it imported it. A grant gives none
  of a granted module's private providers.
- The blueprint records the grant per module. A later load leaves a recorded grant as it
  is, and a module the graph already held gets nothing from a later grant.
- Each granted module must already be in the graph: the previous blueprint holds its
  definition (`moduleByDefinition`, or `moduleByReplaced` for a module a `compile.module`
  hook replaced). A grant adds visibility and never adds a module. A `forRoot` result must
  be the object the host imported, since a fresh `forRoot()` call makes a new definition.
- A grant of the root module fails with reason `root`. The root's exports are its public
  surface for tests and lookups, and a loaded module that needs root providers names the
  host module that holds them.
- A grant of a global module is legal and adds nothing.
- A repeat `load(m, options)` of a module the graph holds does nothing when the granted set
  equals the recorded one (same definitions, order ignored), and when the call grants
  nothing. A repeat that grants another set fails with reason `already-loaded`, as does a
  grant for a module the root imports statically.
- Module cycles cannot form: each module a grant applies to is new, so no granted module
  imports it.
- `NEXUS_LOAD_GLOBAL_MODULE` still rejects a global loaded module, `NEXUS_LOAD_CONTRIBUTION`
  still rejects a published contribution, and K2 applies as usual.
- A token a loaded module needs and no source exports fails the load with
  `NEXUS_MISSING_PROVIDER` inside `BlueprintError`, as today.

### 7.4 Errors

`LoadGrantError`, code `NEXUS_LOAD_GRANT`, fields `module` (the loaded module), `grant` (the
granted module's name) and `reason: 'not-in-graph' | 'root' | 'already-loaded'`. `compile()`
raises it with the other load checks and throws it directly. `Nexus.check` wraps it through
`isLoadError` (section 4.5). It gets a code entry, an `is-nexus-error` mapping, text with a
fix per reason in `core-text.ts`, an error page and an error example.

### 7.5 Implementation

- `Blueprint.extraImports` holds `LoadEntry` values. `walk` visits each loaded entry, and for
  a granted one passes the grant to every node the walk creates under it. `visit(ref,
extra)` already appends `extra` refs to a node's imports, the mechanism the root's extra
  imports use, and `byDefinition` returns the granted modules' existing ids.
- `compile()` checks each grant against `previous` next to `checkNewGlobals`.
- `ModuleNode` gains `grants: readonly string[]`, the module ids a grant added. `ModuleView`
  gains the same field, so `graph()`, `libs/devtools/src/parse-graph.ts` and the graph JSON
  of `@nexusdi/cli` (`libs/cli/test-fixtures/json/graph.json`) carry it, and a renderer can
  draw a grant apart from an import. The field is additive, so the plugin API version stays.
- The load-once logic: `loader()` in `libs/{express,fastify,hono,react-router}/src/internal/request-scope.ts`
  (lines 290-309) keys a map on the module alone, in four copies (P4). Core exports one
  helper, `loadOnce(container)`, from `@nexusdi/core`, keyed on the module and its granted
  set, and the four adapters and `lazySection` use it. Core already decides the repeat rule
  of section 7.3, so the helper only shares the pending promise and forgets a failed load.

## 8. Extension principle

- P2: `EdgeKind` stays a closed union that only core adds to, and K3 adds no member. The
  `LoadGrantError` `reason` and the `Dep` union are core's own sets. `DepKind` gains
  `lazy-all`, which no other package reads.
- P3: the view's `grants` field is a versioned contribution point, and additive.
- P4: K4 replaces the four copies of `loader()` with one core export.
- Each new error follows the package-owned errors rule: core owns the code and its text.

## 9. Docs

- `multi-providers.mdx`: "Visibility and Encapsulation" becomes "Publishing Contributions",
  with a library-owned extension point example (`MultiToken<IHealthCheck>`, contributors
  bound with `useClass`), the three statements of section 4.1, the ordering sentence of
  section 4.2, `lazy(all())` for a collector its contributors call, and the K2 error in place
  of the silent private case. "`all()` is the only modifier a multi-token takes" changes to
  the rule of section 5.2.
- `lazy.mdx`: a section on collectors, with the all-or-nothing thunk and `NEXUS_DISPOSED`
  from a collector's dispose method.
- `load.mdx`: "Design Constraints" gains the contribution rule, and a new section "Granting
  Host Modules to a Loaded Module" explains section 7, with the sentence that a grant is no
  security boundary.
- `federation.mdx`: `Tactical` loses `global: true`, and the section loads with the grant.
  The "delete `global: true`" Try-it becomes "delete the grant".
- `modules.mdx`: the `{ module }` paragraph and the global section, which points hosts at
  grants.
- The adapter pages (`express.mdx`, `fastify.mdx`, `hono.mdx`, `react-router-ssr.mdx`,
  `react.mdx`) show the option.
- Four error pages: `NEXUS_LOAD_CONTRIBUTION`, `NEXUS_UNREAD_CONTRIBUTION`,
  `NEXUS_LOAD_GRANT`, and the `api-errors.mdx` list.

## 10. Demo refactor amendments

`specs/plans/2026-10-28-demo-refactor.md` changes with this spec:

- Only `Simulation` and `SubspaceLink` stay global. `MeridianSystems` stays a constant that
  imports every system and exports nothing, bridge-api's `AlarmPanel` keeps
  `exports: [ALARM_SINKS]`, and the shell's `Tactical` is granted to each station. All three
  lose `global: true`.
- Every system module exports the multi tokens it contributes to.
- `PlasmaRouter` takes `lazy(all(POWER_CONSUMERS))`, and the consumers take `POWER_ROUTER`
  directly.
- The test globals go.
- T16 and T17 gain cases, T17b is new, and PR 2 waits for K1, K3 and K2, with T17b after K4.

## 11. Owner rulings, 2026-10-28

- K1 goes into 0.4 (rc.3) as the default for every multi token, with `exports` as publish.
  No `collect: 'imports'` mode: no user needs it.
- `NEXUS_LOAD_CONTRIBUTION` is enforced in `compile()`, so `Nexus.check({ load })` reports it.
- rc users are not a constraint: "they are aware that new RCs can break things". Nothing
  moves to 0.5 to protect rc.2 API.
- K2, K3 and K4 are in 0.4.
- Earlier rulings this spec keeps: `load()` must not extend multi tokens; `FtlDrive` registers
  DI-built parts through explicit registries in `onInit` and unregisters on dispose; explicit
  module imports.

## 12. Tech lead rulings

- K1: the pass separates a module's view of a multi token from what it publishes (section
  4.4). The load guard runs in `compile()` after `rewriteProviders`. It treats a pin as a
  publish and skips a record the previous blueprint published (#230, tech lead).
  Its fix text sends users to an `onInit` registry. `exports: [T]` with no own record stays
  legal. The oracle test is rewritten first.
- K2: the fix text order of section 6.2. `get(T, { module })` and `view.visible()` do not
  count as readers, and the docs say so. `lazy(all)` bindings count.
- K3: edge kind `lazy` per contribution with `written` set to the multi token, and
  `lazy-all` internal only. The thunk is all or nothing. `resolve()` and `validate()` handle
  `lazy-all` per id. `NEXUS_DISPOSED` from a dispose method that calls the thunk is documented. Interceptor cases cover
  the wider `reach()`. `DepFor` gains the `LazyAll` arm, `depOf` accepts `lazy-all`, and
  `@Inject` takes it through `Dep`.
- K4: a grant of the root fails with reason `root`. One core load helper replaces the four
  adapter copies. A grant applies to every module the load adds, is recorded per module and
  stays fixed on later loads. The docs never call a grant isolation or a security boundary.
  The devtools and cli graph fixtures carry `grants`.
- Order and sizes: K1 M, K3 M, K2 S, K4 L. K1, then K3, then K2. K4 after K1 in parallel, and
  merged last before rc.3.
