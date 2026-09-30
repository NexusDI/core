# The extension principle

Status: draft, 2026-09-30. The owner approved the text-pack design (part 2) at fbcd090.
The extension principle (section 1), the audit (section 3) and the ruled fixes (sections
4 and 5) were added after that approval, from the architect's audit and the tech lead's
rulings. Part 2 was built from the architect's design A and the tech lead's amendments.
Tech lead notes on section 4.5 applied 2026-09-30. The tech lead's rulings from the
`feat/core-0.4` build and the measured sizes (sections 2.5.1, 2.5.10, 2.7, 6 and 7)
applied 2026-10-01.

Amends the core 0.4 spec (`specs/2026-09-23-core-0.4-design.md`) sections D15, 3.10.1,
3.10.2, 3.10.3, 3.10.4, 3.10.6, 9, 9.1, 10 and 12.1, and records P1-P5 there. Replaces
owner decision O5 of the interceptors spec (`specs/2026-09-29-interceptors-design.md` on
`feat/rfc-17-interceptors`) and amends its R9 (V15). Amends the react spec sections 14
and 15 and the integrations spec sections 3.6 and 3.7 (section 5.2).

Packages that change: `@nexusdi/core`, `@nexusdi/errors`, `@nexusdi/devtools`,
`@nexusdi/testing` (V7), `@nexusdi/federation` (V10), `@nexusdi/interceptors` (PR #62)
and `@nexusdi/cli` (PR #61). Specs that change: react (V11) and integrations (V12).
`@nexusdi/decorators` and `@nexusdi/node` do not change.

Depends on: `feat/core-0.4` (plugin API of core spec 3.10, thin errors of D21), PR #63
(`format.ts` under `HOOK_SITES`), PR #62 and PR #61, none merged yet. No release has
published plugin API 1, `@nexusdi/errors`, `@nexusdi/devtools`, `@nexusdi/testing` or
`@nexusdi/federation`. 0.3.2 published `@nexusdi/core` only, and none of the core
changes below touch its 0.3 API. Every change below is a change to unreleased API.

## 1. The extension principle

The owner, on the text packs: "I just want to make it easy for third-party packages to
integrate with our errors package (and other packages), and don't want to have to update
a package just because another one adds a new error or something... I meant it as a
general design principle/rule. follows open/close principle."

The principle, for the core spec and the contributing guide:

> A package integrates with another through a public contribution point that a third
> party can use the same way. Adding an error, an event, a node note or a package never
> requires a change in a package that does not own it.

Five rules make the principle checkable. Each rule has a test that CI runs and a list of
named exceptions. A new exception needs a spec change that names it.

### 1.1 Scope

The rules apply to every published package and every spec for one, `@nexusdi/cli`
included. They do not apply to repository tooling (`tools/repo-checks`,
`scripts/*.mjs`, `.fallowrc.jsonc`, commitlint scopes, `examples/size`, root
`tsconfig.json` references) or to `benchmarks/` and `tools/bench-kit`. Those hold
first-party wiring and a curated comparison. No third party contributes to them, and each
new first-party package edits them once.

### 1.2 P1. The owner holds its vocabulary

A package reads another package's codes, event types, ids, brands and hidden fields only
through what the owner exports. It never lists them in a table, switch, regex or string
compare, and never calls `Symbol.for` on another package's key.

- Test: a repo-check over `libs/*/src`, tests and `test-support` excluded, fails on (a) a
  `'NEXUS_[A-Z_]+'` literal that a different package declares in `NexusErrorByCode`,
  (b) `Symbol.for('nexusdi.<name>')` outside the package that defines it, (c)
  `startsWith('NEXUS_')` or any other prefix test on `code`.
- Exception: one equality check on one documented public code, with a default branch for
  every other value, named in the repo-check's allowlist. The allowlist holds two
  entries: cli's `NEXUS_BLUEPRINT_INVALID` and the adapters' `NEXUS_DISPOSED`.
- The check does not look for literals equal to a core-internal id (the audit's R1 item
  d). No check can know every internal id. P1's first sentence covers the case, and
  review catches it.

### 1.3 P2. An extensible set is open in its type, and consumers default

When the owner documents a set as extensible by other packages, the set is an
augmentable interface or a registration argument. Code that branches on it handles an
unknown member. The owner decides per set, in the spec that adds the set. A closed union
is correct for any set that only its owner adds to.

- Open sets: `NexusErrorByCode`, `TraceEventByType` (if the owner approves V2), text
  packs (`errors({ text })`) and graph annotators (`devtools({ annotate })`).
- Test: one type test per open set extends it from a separate file, as a third party
  would, and compiles.
- Exception: none. A consumer may key a record on a closed union (`Lifetime`, edge
  kinds, reason unions) when the compiler checks the record against the owner's type.
  No scan forces every exported string union into an allowlist.

### 1.4 P3. Integrate through public, versioned contribution points

Every cross-package integration goes through an exported API: a plugin hook, a
`PluginContext` member, a view field or an options argument. A first-party package uses
nothing a third party cannot reach. Core names no other package, plugin name or plugin
code. Every type a third party implements or augments to integrate is plugin API and
follows core spec 3.10.2: an added member keeps `NEXUS_PLUGIN_API`, and a break raises
it.

- Test: the `package-imports` repo-check (a lib reaches core through `@nexusdi/core` and
  `@nexusdi/core/text` only), a grep of `libs/core/src` for `@nexusdi/` specifiers other
  than core and for `'nexus:` literals, and `plugin-api-1.test-d.ts`. That file holds one
  third-party plugin, written in a separate file, that uses every contribution point of
  section 2.5.11, including a `GraphAnnotator` matched structurally with no devtools
  import. It must compile on every commit until `NEXUS_PLUGIN_API` changes.
- Exception: none in published source.

### 1.5 P4. No copy of another package's logic

A helper that two packages must keep in step is exported by its owner and imported by
the other.

- Test: the fallow duplicates gate, with no ignore that spans two packages except the
  one named below, and a grep that fails on "keep them in step with libs/".
- Exceptions: a check against a language or platform contract, such as the TC39
  `context.kind` test. The integrations adapters' `request-scope.ts` and
  `dispose-with-body.ts`, which the owner kept as guarded copies (integrations spec 2.1
  item 2). The `adapter-shared-copies` repo-check keeps them byte-identical (V13).

### 1.6 P5. Optional dependencies point one way and degrade by construction

A package names an optional package only through `import type`, or from a subpath the
application opts into (`/text`, `/devtools`). The application writes the wiring line. No
package detects a missing package at runtime, looks a plugin up by name, or dynamically
imports a `@nexusdi/*` peer.

- Test: a repo-check that every `@nexusdi/*` import in a package's main entry graph is a
  declared peer or dependency, that an optional peer appears only in `import type` or
  under a subpath entry, and that no source matches `name === 'nexus:` or
  `import('@nexusdi/`.
- Exceptions: `@nexusdi/devtools` depends on `@nexusdi/errors`, because the errors engine
  is part of devtools (section 2.5.8). `@nexusdi/cli` resolves the project's
  `@nexusdi/devtools` at run time, which is the cli's job.

### 1.7 Error text

The audit's R6, "each code has text in one reachable place", applies the principle to
error text. It leaves the general list and lives on as section 2.5.1 (text-pack section 5.1
at fbcd090), with its own per-package test.

## 2. Text packs: the first application

Part 2 is the text-pack design the owner approved at fbcd090, with its sections nested
under 2 and the tech lead's corrections for V3, V9, V10 and V14 applied. Its requirements
R1-R4 are the text-pack requirements. The principle's rules are P1-P5.

### 2.1 Context

D15 took core's message text out of core and put it in `@nexusdi/errors`, which formats
through the `formatError` hook. Core spec section 9 then said each optional package
writes its own errors' full text inline. PR #62 departed from that: it added
`libs/errors/src/interceptors.ts` (`INTERCEPTOR_BUILDERS`, spread into `BUILDERS`), so
`errors()` grew by 1,305 B gzip for every app, interceptors installed or not, and
`@nexusdi/errors` had to change and release for another package's errors.

Measured on `feat/core-0.4`:

- `formatThrown` (`libs/core/src/runtime/format.ts`) lets the first `formatError` hook
  that returns text write the message. It formats a `BlueprintError`'s inner errors
  first. It skips an error already formatted, one `fromUserCode` marked, and one built
  with `NexusErrorOptions.text` (`ownsText`, the `OWN_TEXT` WeakSet in
  `libs/core/src/errors/nexus-error.ts`). It writes `text.nearMisses` back only for
  `MissingProviderError`.
- `@nexusdi/errors` holds core's text table (`builders.ts`, `reasons.ts`,
  `describe-thrown.ts`, about 3,714 B gzip) and a 628 B engine (`explain.ts`,
  `layout.ts`, `near-misses.ts`, `errors.ts`). `explain()` returns `undefined` for a
  code it has no builder for. `nearMissesOf` reads the hidden `lookup` that core puts on
  a `MissingProviderError`.
- `@nexusdi/devtools` has a hard dependency on `@nexusdi/errors` and calls `explain()`
  directly in `devtools.ts` and `inspect.ts`. `inspect()` puts its `nexus:inspect`
  formatter ahead of `options.plugins`.
- Core's one-line message ends in `DOCS_URL + code`, with `DOCS_URL` fixed to
  `https://nexus.js.org/errors/`, so a third-party error links to a page NexusDI does not
  host.
- `NEXUS_PLUGIN_API` is 1. `PluginContext` has `container`, `blueprint()` and
  `builtAsync()`. It exposes no plugin list.
- Of PR #62's 26 interceptor raise sites, 16 never pass through `formatError`: 6 at
  decorator time in `use-interceptors.ts`, 3 at the `interceptors()` call in
  `options.ts`, 5 at method-call time in `proxy.ts`, and 2 in `plugin.ts` hooks, where
  core wraps them as the `cause` of `NEXUS_PLUGIN_FAILED`.

### 2.2 Requirements

- R1. A third-party package contributes error text, near misses and `explain()` output
  to `@nexusdi/errors` through a public, stable contribution API, with no change to
  `@nexusdi/errors`.
- R2. A new error in package A never requires a release or a code change in
  `@nexusdi/errors` or any other package. `@nexusdi/errors` holds no per-package tables.
- R3. The same open-extension rule holds for the other cross-package integrations: at
  least devtools (`graph()`, `inspect()`) and testing (overrides). Section 1 states that
  rule in general as P1-P5.
- R4. A package degrades cleanly when an optional dependency such as `@nexusdi/errors` is
  not installed.

Every choice below is also checked against the pillars of core spec section 0:
lightweight core, not complicated, developer friendly, users first, and one version for
all packages.

### 2.3 Decision

Each package writes the text of its own errors as a text pack: a plain object that maps
the package's error codes to functions returning `ErrorText`. The pack lives in the
package that raises the errors, at its `/text` subpath. The contract types live in core
and are type-only. `@nexusdi/errors` becomes an engine with no text of its own: it takes
packs through `errors({ text })` and `explain(error, { view, text })`, and devtools
passes them on through `devtools({ text })` and `inspect(root, { text })`. The engine
always adds core's pack, which moves to `@nexusdi/core/text`. No package imports
`@nexusdi/errors` except devtools, so no package has anything to detect when it is
missing.

An error that no formatter can reach carries its own text inline, as decorators and
devtools already do. That rule decides, site by site, which errors are thin and which
are inline (section 2.5.1). Two packages on `feat/core-0.4` raise formatter-reachable
errors with inline text today, because `compile.check` reports them:

- `@nexusdi/federation` moves the text of `NEXUS_CONTRACT_VERSION` to
  `@nexusdi/federation/text` (V10).
- `@nexusdi/testing` keeps inline text on `NEXUS_OVERRIDE_UNUSED` and
  `NEXUS_OVERRIDE_EXPORTS` under one named exception to section 2.5.1 (V9). No pack can
  replace or translate those two codes.

### 2.4 Where this departs from the owner's earlier wording

- "A package should short-circuit if a dependency package is not available." No package
  checks at runtime whether `@nexusdi/errors` is installed. The dependency runs the other
  way: a pack imports only types from core, and `@nexusdi/errors` receives packs from the
  application. An app without `@nexusdi/errors` never imports a pack, so no code path
  exists that could fail. A runtime check would need a dynamic import of a missing peer,
  which fails the build in Vite 6.3.5 / Rollup 4.44 (measured), or a plugin lookup by
  name, which core does not expose and which breaks when a user renames or wraps a
  plugin. R4 holds by construction.
- "Packages should own their errors but integrate with the errors plugin." Kept. A
  package owns its codes, fields and text. The integration is one line the application
  writes: `errors({ text: [interceptorsText] })`. Installing a package and
  `@nexusdi/errors` does not give that package full text with no wiring. Automatic text
  needs one of two things. The text could go into the package's production bundle for
  every user (+1.2 to 1.4 KB for interceptors), or core could discover packages at
  runtime, which D19 rejects. The one-line message of an unwired error links to the
  package's docs page for that code, and that page shows the full text and the wiring
  line (section 2.5.7).
- The owner prefers discrete packages over subpaths. Packs use a subpath (section
  2.5.9).
- Core spec section 9 said "Each package writes its own errors' full text, since the
  package is optional already." This spec narrows that to errors no formatter reaches.
  Errors a container formats stay thin and get their text from the package's pack.
- Interceptors spec O5 put interceptor text in `@nexusdi/errors`. This spec reverses it:
  R2 forbids it, and it added 1,305 B to every `errors()` user's bundle.

### 2.5 Design

#### 2.5.1 Where text lives

A package writes each error's text in one of two places, by one rule:

- Inline, with `NexusErrorOptions.text`, when the error is raised where no container
  formatter runs: at decorator evaluation, at module load, inside a plugin hook whose
  throw core wraps as a cause, or while the plugin has no `PluginContext` yet. Core never
  rewrites an inline message (`ownsText`).
- In the package's text pack, for every other error: errors raised inside a container
  operation, reported by `compile.check`, or formatted by the plugin through
  `PluginContext.format` (section 2.5.6).

A package declares each code once, in `NexusErrorByCode`. Each first-party package has a
test that fails in two cases. A declared code has neither a pack entry nor an inline
raise site. A raise site that `compile.check` reports, or that `PluginContext.format`
formats, passes `text`. The second check fails closed: a `report(...)` or `.format(...)`
argument that is not a local `new X(...)` or a known package-local factory fails unless
a named allowlist entry gives a reason.

`NEXUS_BLUEPRINT_INVALID` has no pack entry, because the engine renders its aggregate
(section 2.5.3). The engine finds it with `instanceof BlueprintError`, so it names no
code (P1). The test counts it as engine-rendered, a category separate from the allowlist.

The test holds one allowlist entry: `@nexusdi/testing`'s `NEXUS_OVERRIDE_UNUSED` and
`NEXUS_OVERRIDE_EXPORTS`, with the reason "dev-only package; full text with zero wiring;
translation not supported". testing reports both from `compile.check`, where the
container's formatter runs, and both keep inline text. `ownsText` makes every formatter
skip them, so `errors({ text })` cannot replace or translate them. testing cannot import
`@nexusdi/errors` (section 2.6.1), so a testing pack would need a second pack engine
inside testing. Moving the two codes to a pack later keeps their text and only adds the
option to override it, so the move is not a breaking change.

#### 2.5.2 The pack contract

In `@nexusdi/core`, type-only:

```ts
/** Text for the codes one package raises. Keys are codes from NexusErrorByCode. */
export type ErrorTextPack = {
  readonly [C in keyof NexusErrorByCode]?: (
    error: NexusErrorByCode[C],
    view: BlueprintView | undefined,
    kit: ErrorTextKit
  ) => ErrorText | undefined;
};

/** What @nexusdi/errors lends a pack. Grows by adding members only. */
export interface ErrorTextKit {
  /** Where `token` exists that `moduleId` cannot see. Empty without a view. */
  nearMisses(token: unknown, moduleId: string): readonly NearMiss[];
}
```

`ErrorText` and `NearMiss` are already public. A pack entry that returns `undefined`
leaves the error to the next pack. A third-party package publishes its errors and its
pack together:

```ts
// @acme/cache
import { errorBase, Token } from '@nexusdi/core';

export interface ICache {
  read(key: string): Promise<unknown>;
}
export const CACHE = new Token<ICache>('Cache');

interface CacheStoreFields {
  readonly store: string;
  readonly module: string;
}
export class CacheStoreError extends errorBase<
  'ACME_CACHE_STORE',
  CacheStoreFields
>('ACME_CACHE_STORE', 'CacheStoreError', 'https://acme.dev/errors/') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_CACHE_STORE: CacheStoreError;
  }
}
```

```ts
// @acme/cache/text
import type { ErrorTextPack } from '@nexusdi/core';

export const cacheText = {
  ACME_CACHE_STORE: (error, view, kit) => {
    const lookup = (error as { lookup?: { token: unknown; moduleId: string } })
      .lookup;
    return {
      message: `${error.module} asked for the ${error.store} store, which no module provides.`,
      fix: 'provide it: provide(CACHE_STORE, { useClass: RedisStore }).',
      nearMisses:
        lookup === undefined
          ? []
          : kit.nearMisses(lookup.token, lookup.moduleId),
    };
  },
} satisfies ErrorTextPack;
```

The application:

```ts
import { Nexus, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { CACHE, type ICache } from '@acme/cache';
import { cacheText } from '@acme/cache/text';

class RedisCache implements ICache {
  async read(key: string) {
    return redis.get(key);
  }
}

const ship = await Nexus.create([provide(CACHE, { useClass: RedisCache })], {
  plugins: [errors({ text: [cacheText] })],
});
```

The pack reads the error's fields, and the error class and the pack are published in
the same package at the same version, so they cannot drift apart. That is why text lives
with the raising package.

#### 2.5.3 Registration

- `errors(options?: { text?: readonly ErrorTextPack[] })` returns the `nexus:errors`
  plugin. Its `formatError` calls `explain(error, { view, text })`.
- `explain(error, options?: { view?: BlueprintView; text?: readonly ErrorTextPack[] })`
  returns the `ErrorText` of the first pack entry that returns one, or `undefined`. It
  runs outside any container, so code that caught an error from a container without the
  plugin, the CLI and devtools all use it. It builds the kit from `view`. Without a view,
  `kit.nearMisses` returns an empty list. A `BlueprintError` gets its aggregate text from
  the engine, which renders each inner error through the same packs.
- `devtools(options?: { text?, annotate?, trace? })` formats with the same packs.
- `inspect(root, options?: CheckOptions & { text?, annotate? })` formats with them too
  (section 2.6.3).

A project that registers `errors()` in production and `devtools()` in development shares
one list: `const text = [interceptorsText, federationText, cacheText]`.

The engine reads a pack entry with `Object.hasOwn(pack, error.code)`, so a code named
after an `Object.prototype` key never calls inherited code.

#### 2.5.4 Ordering

- Across plugins: unchanged. The first `formatError` hook in the `plugins` array that
  returns text decides (core spec 3.10.2).
- Inside one `errors()`, `devtools()`, `inspect()` or `explain()` call: the caller's
  packs in array order, then core's pack. A pack listed earlier overrides a later one for
  the same code, so a translation pack for core's codes works by listing it.
- `inspect()` puts its internal formatter after the caller's plugins (section 2.6.3).

#### 2.5.5 Near misses

The near-miss search (`near-misses.ts`) stays in `@nexusdi/errors`. It reads only the
public `BlueprintView` and `Token`. It skips core's built-in request provider with
`view.providers.filter((p) => p.token !== REQUEST)`, with `REQUEST` imported from
`@nexusdi/core`, and reads no core-internal provider id (V3). Packs reach the search
through `kit.nearMisses`, so no pack imports `@nexusdi/errors`. Core's
`MissingProviderError` keeps its hidden `lookup`, and core's own pack reads it, so that
contract stays inside core. A third-party error that wants near misses stores what it
looked up with `NexusErrorOptions.hidden` and passes it to the kit.

`formatThrown` writes `text.nearMisses` back to the error when the error has an own
`nearMisses` property, whatever its class. Today the check is
`error instanceof MissingProviderError`. The edit is in `format.ts` and goes in after
PR #63.

#### 2.5.6 Formatting outside a container operation

`PluginContext` gains one member:

```ts
export interface PluginContext {
  // container, blueprint(), builtAsync() as today
  /** `error` with this container's formatError text, as core formats an error it raises. */
  format<E>(error: E): E;
}
```

It calls `formatFor(state, error)`, so the rules of core spec 9.1 apply: formatted once,
never an own-text error, never a value user code threw, and a length check when the
container has no formatter. A plugin that raises errors after `setup`, such as a proxy at
method-call time, throws `context.format(error)`. The member is built in
`pluginContext()` in `runtime/plugins.ts`, which PR #63 does not touch. Est. +20 B in
core.

#### 2.5.7 Docs links for thin messages

`errorBase` takes an optional third argument, the docs base URL, defaulting to
`DOCS_URL`. `lineOf` ends the one-line message with that base and the code. First-party
packages keep the default and host a page per code on nexus.js.org. A third-party
package passes its own base. Each package's docs page for a code shows the full text and
the line that registers the pack, so a user who forgot the pack reaches that page from
the message. Est. +20 B in core.

#### 2.5.8 Degradation when an optional package is absent

- `@nexusdi/errors` not installed: nothing imports it. Core writes one-line messages with
  the owning package's docs link. Inline-text errors keep their full text.
- `@nexusdi/errors` installed, a package's pack not registered: that package's codes get
  no pack entry, `explain()` returns `undefined`, and the one-line message stays. Core's
  codes still get full text, because the engine always adds core's pack. For
  `NEXUS_CONTRACT_VERSION` without `federationText`, the user sees
  `contract=… required=… provided=…. https://nexus.js.org/errors/NEXUS_CONTRACT_VERSION`
  and no "Fix:" sentence.
- A pack registered for a package the app does not use: its entries never match. The
  pack adds its own bytes (about 1 KB for interceptors) and nothing else.
- `@nexusdi/devtools` not installed: `@nexusdi/interceptors/devtools` is the only module
  that names it, with a type-only import, and the app does not import that module.
  `@nexusdi/devtools` is an optional peer of `@nexusdi/interceptors`.
- `@nexusdi/devtools` keeps its hard dependency on `@nexusdi/errors`. The errors engine is
  part of devtools (P5's named exception).

#### 2.5.9 Entry points and tree-shaking

A pack is its own entry point (`./text`), and nothing in the package's main entry imports
it. An app that does not import the subpath carries 0 bytes of the pack in every bundler
and in unbundled ESM. A tree-shaken export from the main entry would also be 0 bytes in
esbuild, Rollup and webpack, but it would still reach unbundled and CDN-bundled imports of
the main entry, which matters for core (3.7 KB). A repo check in `tools/repo-checks`
fails when a package's main entry imports its own `text/` or `devtools/` module.

Packs use a subpath, and no pack gets a discrete package. D9 moved optional features into
packages so an app does not install a feature it does not use and a new user sees a
smaller core API. A pack is text for a package that is already installed, so neither
reason applies. A pack also reads its package's error fields by shape and must match that
package's exact version. A subpath cannot skew. A discrete `@nexusdi/<pkg>-text` package
can, unless it pins an exact peer. Each discrete package also needs about 12 boilerplate
files plus fallow, `verify-packaging`, commitlint scope and size-report wiring, and the
package count doubles. `scripts/verify-packaging.mjs` already checks every `exports`
entry, so subpaths need no new tooling.

#### 2.5.10 Core's text

Core's builders move from `libs/errors/src/{builders,reasons}.ts` to
`libs/core/src/text/`, exported as `coreText` from `@nexusdi/core/text`. Their text is
unchanged, and the revision 1 error tests still pass with `errors()` registered (core
spec section 17). `@nexusdi/errors` deletes its copies of core's `describeThrown` and
`layoutText` (`describe-thrown.ts`, `layout.ts`, P4), and `@nexusdi/core/text`
re-exports `layoutText` for the engine. A new core error is then one change inside
`libs/core`, which R2 requires. Core's main bundle does not change. Core's tarball grows
by about 20 KB raw of source, in a package every user already installs.

Core spec 12.1 changes. Core gains `text/`, which imports `describeThrown` and
`layoutText` from `errors/`, and only types from `blueprint/views.ts` and `definitions/`.
Nothing in core imports `text/`. Optional packages import `@nexusdi/core` and
`@nexusdi/core/text` and nothing else of core. Among first-party packages only
`@nexusdi/errors` imports `@nexusdi/core/text`.

#### 2.5.11 Plugin API version and contract stability

`NEXUS_PLUGIN_API` stays 1. These contribution points join plugin API 1 and follow core
spec 3.10.2:

- `ErrorTextPack`, `ErrorTextKit` and `PluginContext.format`.
- `GraphAnnotator` and `GraphNote` from `@nexusdi/devtools` (V14). A structural match
  with no import is the case a version rule protects most, because the compiler sees no
  shared type.
- `PluginContext.emit` and `TraceEventByType`, only if the owner approves V2 (section 8,
  item 1).
- `displayName`, `describeValue` and `isForeign`, only if the owner approves V7 (section
  8, item 2). Their signatures are versioned, and the wording they return can change in any release.

A new `ErrorTextKit` member, a new optional `ErrorText` field, a new `PluginContext`
member, a new optional `GraphNote` field or a new `TraceEventByType` key does not raise
the version. A change that breaks a pack, an annotator or a plugin written for version N
raises it to N + 1. `plugin-api-1.test-d.ts` (P3) uses every point in the list. A pack
carries no version of its own. It matches its package's error fields because both are
published in one package, and it matches the engine because the kit only grows. Lockstep
versions keep first-party packs, core and the engine at one version.

#### 2.5.12 Interceptors under this rule

| Sites                                  | Where raised                       | Text                                  |
| -------------------------------------- | ---------------------------------- | ------------------------------------- |
| 6 in `use-interceptors.ts`             | decorator evaluation               | inline                                |
| 3 in `options.ts`, and `interceptor()` | moved to `compile.check`           | pack                                  |
| 9 in `check.ts`, `plugin.ts:170`       | `compile.check`                    | pack                                  |
| `NOT_READY` in `proxy.ts` (2)          | before `setup` or after disposal   | inline                                |
| `missing`, `bad-next`, `bad-target`    | method call after `setup`          | pack, thrown through `context.format` |
| `no-intercept`, `unknown-method` (2)   | `construct` hook, wrapped as cause | inline                                |

Options validation moves into `compile.check`. `interceptors(options)` parses its options
into either a config or a list of faults. With faults, its `compile`, `construct` and
`setup` hooks do nothing, and `compile.check` reports every fault. All option faults then
arrive in one `BlueprintError` with the graph's other errors, and get pack text.
TypeScript types already reject most bad options at compile time, so the move affects
JavaScript callers and computed options.

### 2.6 R3: other integrations

#### 2.6.1 Testing overrides

Already meets R3. `@nexusdi/testing` places `nexus:testing` ahead of the caller's plugins
(`libs/testing/src/index.ts`). `override()` works on any token, including tokens that a
plugin's contributed modules provide, and on interceptor tokens. `@nexusdi/testing`
imports no other `@nexusdi` package, so a new package needs no change in testing. No fix
for overrides. testing's copies of core helpers are V7, and its two inline-text codes are
section 2.5.1's exception.

#### 2.6.2 devtools text

Gap: `devtools.ts` and `inspect.ts` call `explain(error, view)`, which only knows core's
text. Fix: `devtools({ text })` and `inspect(root, { text })` pass packs to `explain()`
(section 2.5.3).

#### 2.6.3 inspect()

Plugins already meet R3: `inspect()` passes `options.plugins` to `Nexus.check`. Gap: the
internal `nexus:inspect` formatter runs ahead of the caller's plugins, so its core-only
`explain()` shadows a caller's translation pack for core codes. Fix: the internal plugin
goes after `options.plugins`, and formats with `options.text` plus core's pack.

#### 2.6.4 graph()

Structure already meets R3: `graph()` and `inspect()` build the `NexusGraph` from
`BlueprintView` (`libs/devtools/src/graph.ts`), so a plugin's modules and providers
appear with no devtools change. Gap: a plugin cannot annotate a node, for example
"wrapped by Timing", and the PR #61 renderers (`render/labels.ts`) have no input for it.
Fix, in `@nexusdi/devtools`:

```ts
export interface GraphNote {
  /** A provider id from the view ('p3'). */
  readonly provider: string;
  readonly label: string;
}
export type GraphAnnotator = (view: BlueprintView) => readonly GraphNote[];
```

`devtools({ annotate })` and `inspect(root, { annotate })` take annotators. Each graph
provider gains `notes: string[]`, and `toDot` and `toMermaid` print them under the
provider's label. `@nexusdi/interceptors/devtools` exports `interceptorNotes(plugin)`,
which reads the config of an `interceptors()` object and returns a `GraphAnnotator`. It
imports `GraphAnnotator` as a type from `@nexusdi/devtools`, an optional peer. The types
stay in devtools because graph and note are devtools vocabulary, and core carries none of
it. devtools never imports interceptors, so no cycle arises. A third party can also match
the shape structurally with no import at all.

Each graph provider also gains `internal: boolean` (V4). `graphOf` sets it for core's
request provider by `p.token === REQUEST`, and the renderers hide an internal provider
unless a drawn provider depends on it. No annotator can set it in 0.4 (section 4.14).

#### 2.6.5 CLI

`nexusdi graph --plugins file#export` passes an array to `inspect()`. After section
2.6.3, an `errors({ text })` in that array formats as it does in the app. A follow-up to
PR #61 adds `--text file#export` and `--annotate file#export`, each an array, passed as
`inspect()`'s `text` and `annotate`. `@nexusdi/cli` imports no pack itself.

### 2.7 Migration per branch

Merge order: PR #63, then the `feat/core-0.4` changes, then PR #62 rebased, then PR #61
and its follow-up. Section 5 places the audit fixes around these steps.

`feat/core-0.4`:

1. Move `builders.ts` and `reasons.ts` to `libs/core/src/text/`, typed as
   `ErrorTextPack`, and delete errors' `describe-thrown.ts` and `layout.ts`. Add the
   `./text` export to core's `package.json`, and to `verify-packaging` and the size
   fixture. `size-report.mjs` measures each `<dir>-text.ts` fixture as `<dir>/text`.
2. Add `ErrorTextPack`, `ErrorTextKit`, `PluginContext.format` and the `errorBase` docs
   argument.
3. Rework `@nexusdi/errors` to the engine plus the registry: `errors({ text })`,
   `explain(error, { view, text })`, the kit, and the `Object.hasOwn` lookup.
   `near-misses.ts` filters by `p.token !== REQUEST` (V3).
4. `@nexusdi/federation`: add `libs/federation/src/text.ts` as `federationText`, exported
   at `./text`, with today's wording and the major-0 branch. `contractVersion` builds the
   error with fields only (V10).
5. `@nexusdi/devtools`: `text` and `annotate` options, `inspect()` ordering,
   `GraphAnnotator`, `notes` on providers.
6. Update `tools/repo-checks`: allow `@nexusdi/core/text`, and fail when a main entry
   imports its own `text/` or `devtools/` module. Extend the section 2.5.1 test to both
   failure cases, with testing's allowlist entry and the engine-rendered
   `NEXUS_BLUEPRINT_INVALID`.
7. Generic `nearMisses` write-back in `format.ts`, on top of PR #63's `HOOK_SITES` form.
8. Edit the core spec: D15 (text lives with the raising package, core's in
   `@nexusdi/core/text`), 3.10.1 (`PluginContext.format`), 3.10.2 (the plugin API 1 list
   of section 2.5.11), 3.10.6, 9 (the rule of section 2.5.1 replaces the inline-text
   sentence), 9.1, 10 and 12.1. Record P1-P5.

PR #62:

1. Delete `libs/errors/src/interceptors.ts`, its test and the `BUILDERS` spread.
2. Add `libs/interceptors/src/text.ts` as `interceptorsText`, exported at `./text`,
   carrying the `interceptors.test.ts` expectations.
3. Apply section 2.5.12: inline text at decorator, construct-hook and `NOT_READY` sites,
   options validation into `compile.check`, and `context.format` at the remaining
   call-time sites.
4. Add `./devtools` with `interceptorNotes` and the optional devtools peer. This step
   waits for PR #61's `render/` files.
5. Add the pack fixture `examples/size/src/interceptors-text.ts`. `feat/core-0.4`
   already taught `size-report.mjs` pack fixtures (step 1).
6. Replace O5 in the interceptors spec, and fix the lightweight row of section 1 and the
   size numbers of section 8.

PR #61: V4, V5 and V6 before merge (section 5.2). The follow-up adds `--text`,
`--annotate` and `notes` rendering in `render/labels.ts`.

PR #63: no change. The `format.ts` edit of step 7 above rebases onto it.

### 2.8 Rejected options

- Design B, each package's plugin takes its pack (`interceptors({ text })`) and formats
  its own codes, detecting `@nexusdi/errors` at runtime. The user wires text in two
  places, because `explain()` outside a container still needs the packs. Detecting
  `@nexusdi/errors` needs a new `formatError` argument or a plugin lookup by name, and
  both edit `format.ts` or `plugins.ts` against PR #63. A name lookup breaks when a plugin
  is renamed or wrapped. The short-circuit saves no bytes, because bytes follow static
  imports.
- Design C, inline text everywhere and `errors()` for core only. Zero wiring and full text
  at every site. It fails R1 for near misses, which would need a hard dependency on
  `@nexusdi/errors`. It puts +1.2 to 1.4 KB into every production bundle that uses
  interceptors. It gives a third party no way to translate or replace text. Section 2.5.1
  keeps C's strength where it counts: sites no formatter reaches.
- C2, inline text behind a `NODE_ENV` guard. A Node production process loses its text,
  and core spec section 0 treats Node as a first-class runtime with full messages in
  production logs. `@nexusdi/react` uses the guard for four render-time codes (V11,
  section 8 item 5), because those codes reach no formatter and a server render still
  logs the code, fields and docs link.
- A plugin field such as `errorText` that core or `@nexusdi/errors` collects from the
  plugin list. The plugin factory would import its pack statically, so the text reaches
  every user's bundle. That is design C's byte cost plus a new core API that exposes the
  plugin list.
- Autoloading packs with a dynamic `import()` of an optional peer. The Vite 6.3.5 /
  Rollup 4.44 build fails when the peer is missing, and D19 rejects runtime discovery.
- A package dynamically importing its own `/text` on first error. `formatError` is
  synchronous, and a preload started at `interceptors()` makes text depend on timing.
- A global registry filled by a side-effect import. Core writes no global (SEC-011),
  containers would share text, and side-effect imports conflict with `sideEffects: false`.
- A discrete text package per package. Version skew against the error fields, and the
  package count doubles (section 2.5.9).
- Core's pack exported from core's main entry. Unbundled and CDN-bundled imports of core
  would carry 3.7 KB (section 2.5.9).
- Keeping core's text in `@nexusdi/errors`. A new core error would need a change in
  `@nexusdi/errors`, which R2 forbids.
- `GraphAnnotator` as a core type. Core would carry devtools vocabulary. The type lives in
  devtools, and a structural match needs no import.
- `@nexusdi/errors` returning a hint text for codes no pack covers. The first hook that
  returns text wins, so the hint would shadow any `formatError` plugin later in the array.
  The docs link of section 2.5.7 does the same job without shadowing.
- Core formatting a plugin hook's `NexusError` cause inside `NEXUS_PLUGIN_FAILED`. It
  changes the 9.1 rule that a wrapped cause keeps its text, and edits `format.ts` against
  PR #63. The two interceptor sites carry inline text.
- A `@nexusdi/testing/text` pack read by a hidden trailing `nexus:testing-text` plugin in
  every testing container (V9). It needs a second pack engine inside testing, which
  copies the errors engine (P4), and a section 2.5.9 repo-check exception, to translate
  two test-only messages no user has asked to translate.

## 3. Audit

The architect audited every published package and spec against the principle on
2026-09-30, read-only. Branch heads: `feat/core-0.4` d354223, `feat/rfc-17-interceptors`
58f8b4a (PR #62), `feat/rfc-18-graph-cli` c7f2a25 (PR #61), `feat/rfc-21-benchmarks`
e9ee6a4. Specs: react (`spec-react`), integrations (`spec-integrations`), text packs
(`spec-package-owned-errors` at fbcd090). The tech lead ruled on each finding.

The audit measured bytes with esbuild 0.25.5 `--bundle --minify --format=esm
--platform=neutral` on the `examples/size/src` fixtures of `feat/core-0.4`, with
`@nexusdi/*` aliased to source, then `gzip -9 | wc -c`. Baselines: core fixture 18,282,
errors 22,590, devtools 22,946, testing 19,516, federation 18,784, interceptors (PR #62
fixture) 21,984. These fixtures include core, and they differ from the size report by up
to 15 B because of the gzip level. "Measured" means the architect built a patched copy of
the source. "Est." means no patch was built.

### 3.1 Seams

| Seam                           | Mechanism today                                                                 | Findings      |
| ------------------------------ | ------------------------------------------------------------------------------- | ------------- |
| core and errors                | `formatError` hook; `BUILDERS` table in errors; hidden `lookup`                 | V1, V3, T1-T4 |
| core and devtools              | `setup`, `observe`, `formatError`; `BlueprintView`; `builtAsync`                | V2, T5, T6    |
| core and any plugin (trace)    | `observe` receives a closed `TraceEvent`; no way to emit                        | V2            |
| errors and interceptors        | PR #62 `INTERCEPTOR_BUILDERS` spread into `BUILDERS`                            | T7, T8        |
| devtools and interceptors      | none today; section 2.6.4 adds `interceptorNotes`                               | V4, T9        |
| devtools and cli               | cli resolves project devtools; `inspect`, `toDot`, `toMermaid`; JSON re-parse   | V5, V6, T10   |
| testing and core               | `compile.*` hooks; copies of core helpers; core's private brand                 | V7, V9        |
| testing and other packages     | none (section 2.6.1)                                                            | pass          |
| interceptors and core          | plugin hooks, `ProviderView.implementation`; copies of core helpers             | V8            |
| node and core                  | `import type { Scope }`                                                         | pass          |
| node and adapters              | structural `scopes` option, no import                                           | pass          |
| decorators and core            | `declareClass`, `declareProperty`, `declareModuleClass`                         | pass          |
| federation and core            | `tokenKey`, `compile.check`; own `nexusdi.contract` brand                       | pass          |
| federation and errors          | none; inline text on a `compile.check` error                                    | V10           |
| react and core                 | `setup`, `context.blueprint()`, K1-K6 view features                             | pass          |
| react and errors               | react spec 14: one-line messages, no pack, no inline text                       | V11           |
| react and devtools             | none                                                                            | pass          |
| adapters and core              | public container and scope API (integrations 3.10)                              | V12           |
| adapters and adapters          | byte-identical copies of `request-scope.ts`, `dispose-with-body.ts`, status map | V13           |
| adapters and errors            | text arrives through the container's formatter                                  | pass          |
| vitest adapter and testing     | `createTestingContainer`, `TestingCreateOptions`                                | pass          |
| text packs spec and plugin API | `GraphAnnotator` and `GraphNote` have no version rule                           | V14           |
| bench-kit and libs             | bench-kit source names no library                                               | pass          |
| benchmarks and competitor libs | `schema.ts` `LIBRARIES`, `libraries.json`                                       | out of scope  |

### 3.2 Findings

Placement keys: core is `feat/core-0.4` before rc.0; #61 is PR #61 (cli, devtools
renderers); #62 is PR #62 (interceptors); TP is this spec. Section 4 gives each accepted
fix in full. The T rows are gaps the text-pack design of part 2 already fixes, listed so
the table covers every seam.

| id  | package            | file:line (branch)                                                                                                                               | rule   | failure                                                                                                                            | ruling                                                      | fix                                                                              | placement             |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------- |
| V1  | core               | `libs/core/src/errors/codes.ts:5`, exported `index.ts:39` (core-0.4)                                                                             | P2     | A package's code is never a `NexusErrorCode`, so a consumer typed on it misses every package code; only a core edit adds one       | accept                                                      | `type NexusErrorCode = keyof NexusErrorByCode`                                   | core                  |
| V2  | core               | `runtime/trace.ts:6`, `runtime/plugins.ts:56-62`, `:333-341` (core-0.4)                                                                          | P2, P3 | A plugin cannot publish a trace event to `trace(fn)` or `devtools({ trace })`; the interceptors spec (line 294) dropped one        | accept, amended; owner decides                              | augmentable `TraceEventByType`, `PluginContext.emit(make)` limited to `a/b` keys | core                  |
| V3  | errors             | `libs/errors/src/near-misses.ts:20` (core-0.4, same on PR #61)                                                                                   | P1     | errors hard-codes core's internal `'request'` provider id; a core id change breaks near misses with no compile error               | accept                                                      | filter on `p.token !== REQUEST`                                                  | core, TP step 3       |
| V4  | devtools           | `libs/devtools/src/render/labels.ts:40-49` (PR #61)                                                                                              | P1, P3 | Renderers hide core's REQUEST by id; a plugin cannot hide its plumbing providers without a devtools edit                           | split: REQUEST part accepted, `GraphNote.internal` deferred | `internal: boolean` on graph providers, set by `p.token === REQUEST`             | #61                   |
| V5  | cli                | `libs/cli/src/graph-json.ts:10-14`, `:129-145` (PR #61)                                                                                          | P1, P4 | cli owns a copy of devtools' graph schema and rebuilds providers field by field; the `notes` field of 2.6.4 is dropped from JSON   | accept                                                      | `parseGraph(value)` exported by devtools; cli calls it                           | #61                   |
| V6  | cli                | `libs/cli/src/graph.ts:22-26` (PR #61)                                                                                                           | P1, P2 | cli recognises a NexusDI error by the `NEXUS_` prefix; a third-party code such as `ACME_CACHE_STORE` escapes the exit-code mapping | accept                                                      | `isNexusError(error)`                                                            | #61                   |
| V7  | testing            | `libs/testing/src/describe.ts:3-59`, brand read at `:53` (core-0.4)                                                                              | P1, P4 | testing copies three core helpers and reads core's private `nexusdi.definition` brand; its `isForeign` copy gets `otherCopy` wrong | accept; owner decides growth                                | core exports `displayName`, `describeValue`, `isForeign`                         | core                  |
| V8  | interceptors       | `libs/interceptors/src/names.ts:4-8`, `use-interceptors.ts:14-19` (PR #62)                                                                       | P4     | third and fourth copies of core's token and value naming, already worded differently from core                                     | accept                                                      | import V7's exports                                                              | #62 rebase after V7   |
| V9  | testing            | `libs/testing/src/override-error.ts:20-24`, `:32-36`; reported at `plugin.ts:156,162,175` (core-0.4); text-pack spec lines 8-9, 81-82 at fbcd090 | 2.5.1  | `NEXUS_OVERRIDE_*` come from `compile.check` but carry inline text, so no pack can replace or translate them                       | reject the fix; debt                                        | keep inline text; one allowlist entry in the 2.5.1 test; correct the spec text   | TP                    |
| V10 | federation         | `libs/federation/src/contract-version-error.ts:15-25`; reported at `federation.ts:55` (core-0.4); text-pack spec lines 8-9, 81-82 at fbcd090     | 2.5.1  | `NEXUS_CONTRACT_VERSION` comes from `compile.check` but carries inline text; no pack can replace it                                | accept; owner confirms                                      | text moves to `@nexusdi/federation/text`                                         | TP, then core         |
| V11 | react (spec)       | `specs/2026-09-24-react-design.md:1083-1087` (spec-react)                                                                                        | 2.5.1  | four codes carry one-line text only; three are raised in render where no formatter runs, so users never see full text              | accept with `NODE_ENV` guard; owner approves                | inline text for the four codes, built only outside production                    | react spec 14, 15     |
| V12 | adapters (spec)    | `specs/2026-09-23-integrations-design.md:335-345`, `:366` (spec-integrations)                                                                    | P1, P2 | the status mapping is a table of core codes; `NEXUS_PLUGIN_FAILED` and third-party codes from `createScope` have no status         | accept                                                      | `NEXUS_DISPOSED` maps to 503, every other NexusError to 500                      | integrations 3.6, 3.7 |
| V13 | adapters (spec)    | `specs/2026-09-23-integrations-design.md:359-381` (spec-integrations)                                                                            | P4, P3 | four byte-identical copies of request scope, body disposal and status code; a third-party adapter must copy them too               | reject for 0.4; debt                                        | none; P4 names the copies as an exception                                        | none                  |
| V14 | devtools (TP spec) | `specs/2026-09-30-package-owned-errors-design.md:396-414`, `:340-348` at fbcd090 (spec-package-owned-errors)                                     | P3     | `GraphAnnotator` and `GraphNote` are a third-party contribution point with no version rule                                         | accept                                                      | plugin API 1 list of 2.5.11                                                      | TP                    |
| T1  | errors             | `libs/errors/src/builders.ts` `BUILDERS`, `explain.ts:45` (core-0.4)                                                                             | P1     | per-code table of core codes in errors                                                                                             | fixed by text packs                                         | 2.5.2, 2.5.10                                                                    | core                  |
| T2  | errors             | `libs/errors/src/explain.ts:43`, `:49` (core-0.4)                                                                                                | P1     | special cases for `NEXUS_BLUEPRINT_INVALID` and `NEXUS_MISSING_PROVIDER`                                                           | fixed by text packs                                         | 2.5.3, 2.5.5                                                                     | core                  |
| T3  | core               | `libs/core/src/runtime/format.ts:80` (core-0.4)                                                                                                  | P1     | `nearMisses` written back only for `MissingProviderError`                                                                          | fixed by text packs                                         | 2.5.5                                                                            | core                  |
| T4  | core, errors       | `libs/core/src/errors/line.ts:2,44`; `libs/errors/src/describe-thrown.ts` copy (core-0.4)                                                        | P3, P4 | every package's one line links to nexus.js.org; errors copies core's `describeThrown`                                              | fixed by text packs                                         | 2.5.7, 2.5.10                                                                    | core                  |
| T5  | devtools           | `libs/devtools/src/devtools.ts:30`, `inspect.ts:32` (core-0.4)                                                                                   | P3     | devtools formats with core's text only                                                                                             | fixed by text packs                                         | 2.6.2                                                                            | core                  |
| T6  | devtools           | `libs/devtools/src/inspect.ts:27-35` (core-0.4)                                                                                                  | P3     | `nexus:inspect` shadows a caller's translation pack                                                                                | fixed by text packs                                         | 2.6.3                                                                            | core                  |
| T7  | errors             | `libs/errors/src/interceptors.ts`, `builders.ts` spread (PR #62)                                                                                 | P1     | errors holds interceptors' text                                                                                                    | fixed by text packs                                         | 2.4, 2.7                                                                         | #62                   |
| T8  | interceptors       | `options.ts`, `proxy.ts` raise sites (PR #62)                                                                                                    | 2.5.1  | 16 raise sites no formatter reaches                                                                                                | fixed by text packs                                         | 2.5.6, 2.5.12                                                                    | #62                   |
| T9  | devtools           | `libs/devtools/src/render/labels.ts:19-33` (PR #61)                                                                                              | P3     | a plugin cannot annotate a node                                                                                                    | fixed by text packs                                         | 2.6.4                                                                            | #61 follow-up         |
| T10 | cli                | `libs/cli/src/args.ts:65-73` (PR #61)                                                                                                            | P3     | no way to pass packs or annotators                                                                                                 | fixed by text packs                                         | 2.6.5                                                                            | #61 follow-up         |

Count by package: core 2, errors 1, devtools 2, cli 2, testing 2, interceptors 1,
federation 1, react spec 1, integrations spec 2, decorators 0, node 0, bench-kit 0.
Total 14. Accepted 11 (V2 amended), split 1 (V4), rejected 2 (V9, V13).

Passes:

- Core names no other package, plugin name or plugin code. `libs/core/src` mentions
  `@nexusdi/testing` only in doc comments (`provide.ts:102`, `blueprint.ts:122`).
- No package looks a plugin up by name. Every `'nexus:'` literal is a package naming its
  own plugin.
- `NexusErrorByCode` is augmentable, and five packages augment it without a core change.
- `isNexusError` checks a `Symbol.for` brand and works for any code and any copy of core.
- `ProviderView.rewrittenBy` and `ProviderRewrite.label` attribute rewrites to any plugin.
- testing imports only `@nexusdi/core`, and `override()` works on any plugin's tokens.
- node imports only `type { Scope }`. The adapters take `scopes` structurally and import
  nothing from node (P5).
- decorators use the public `declareClass`, `declareProperty` and `declareModuleClass`.
  `NEXUS_LEGACY_DECORATORS` is raised at decorator time with inline text (2.5.1).
- federation uses `tokenKey`, `compile.check` and its own `nexusdi.contract` brand.
- devtools builds `NexusGraph` from `BlueprintView`, so a plugin's modules and providers
  appear with no devtools change. `NEXUS_DEVTOOLS_UNREGISTERED` is raised outside a
  container with inline text.
- devtools renderers key `SHAPE` and `EDGE` (`render/dot.ts:14-27`, PR #61) on core's
  closed provider and edge kinds. P2 allows it: `graphOf` assigns `ProviderView['kind']`
  to `NexusGraph`'s field, so a new core kind fails to compile in devtools.
- `trace(fn)` and `devtools({ trace })` pass every event through and switch on no type.
- interceptors (PR #62) uses plugin hooks and public view fields, reads no core-private
  symbol or hidden field, and brands its own metadata (`nexusdi.interceptors`).
- interceptors' legacy-decorator check (`use-interceptors.ts:40-46`) tests the TC39
  `context.kind` contract, which P4 allows.
- cli loads the project's devtools and passes `--plugins` through untouched. `FORMATS`
  and `VIEWS` are the cli's own vocabulary.
- react uses `setup` and `context.blueprint()` only. K1, K2, K3 and K6 are general view
  features with no React vocabulary in core. react imports nothing from devtools.
- The adapters use public container and scope API and implement no hook. Full text
  arrives through the container's formatter, and no adapter imports `@nexusdi/errors`.
- `@nexusdi/vitest` uses `createTestingContainer` and `TestingCreateOptions` only.
- `OverrideDefinition` in core is a generic provider-definition type. Only its doc
  comment names testing.
- `NearMiss`, `InvalidProviderReason`, `InvalidTokenReason` and `PluginInvalidReason` are
  closed core vocabularies. A package with other suggestions uses `ErrorText.hints`.
- `CompilePluginHooks` and `NexusPlugin`'s hook set are the versioned contract itself.
- `tools/bench-kit/src` names no library.
- `benchmarks/src/schema.ts:14-16` and `benchmarks/libraries.json` hard-code the compared
  libraries. Out of scope (section 1.1).
- Repo wiring that lists first-party packages (`scripts/verify-packaging.mjs` `LIBS`,
  `.fallowrc.jsonc`, commitlint scopes, `examples/size/package.json`, root
  `tsconfig.json`) is out of scope. `verify-packaging` could derive `LIBS` from the nx
  project graph, as the release workflow does since d354223. Optional.

## 4. Ruled fixes

Each accepted fix with its final public API, byte impact and placement. Bytes use the
audit's method (section 3).

### 4.1 V1. `NexusErrorCode` covers every package's codes

In `libs/core/src/errors/codes.ts`:

```ts
/** Every code a NexusError carries: core's and each code a package adds to NexusErrorByCode. */
export type NexusErrorCode = keyof NexusErrorByCode;
```

An exhaustive `switch` over `NexusErrorCode` gains cases when a package that augments
`NexusErrorByCode` is in the program. The errors docs page says so.
`nexus-error.test-d.ts:83` changes from an equality check to a test that augments
`NexusErrorByCode` and asserts the new key extends `NexusErrorCode` (P2's type test).
Nothing in `libs/*/src` uses `NexusErrorCode` except its export.

Bytes: 0 B, type only. Placement: core.

### 4.2 V2. Plugins publish trace events

In `libs/core/src/runtime/trace.ts` and `runtime/plugins.ts`:

```ts
/** Each trace event type's fields. A package adds its own by augmentation, keyed `<package>/<event>`. */
export interface TraceEventByType {
  compile: {
    phase: 'create' | 'load' | 'check';
    modules: number;
    providers: number;
    errors: number;
    durationMs: number;
  };
  // construct, untracked, init, scope:create, scope:extend, scope:dispose,
  // dispose:instance, dispose: fields as today
}

/** A trace event. `TraceEvent` alone is the union of every type. */
export type TraceEvent<
  K extends keyof TraceEventByType = keyof TraceEventByType
> = {
  [T in K]: { readonly type: T } & TraceEventByType[T];
}[K];

export interface PluginContext {
  // container, blueprint(), builtAsync(), format() (section 2.5.6)
  /** Hands the event `make` builds to every observe hook, in plugin order. Without an observer, `make` never runs. An exception an observer throws reaches the caller of emit. */
  emit(
    make: () => TraceEvent<
      Extract<keyof TraceEventByType, `${string}/${string}`>
    >
  ): void;
}
```

`pluginContext()` adds `emit: (make) => state.tracer.emit(make)`. `Tracer.emit` is
already lazy. The compiler enforces the package namespace: core's own event types
contain no `/`, so a plugin cannot emit them, and no repo-check is needed. A third
party:

```ts
declare module '@nexusdi/core' {
  interface TraceEventByType {
    '@acme/cache/miss': { key: string; durationMs: number };
  }
}
context.emit(() => ({ type: '@acme/cache/miss', key, durationMs: 0 }));
```

No first-party package needs `emit` for rc.0. The tech lead places it before rc.0
because the principle names events and a third party has no way to add one today.

Bytes, measured: core fixture +8 B (18,282 to 18,290), devtools fixture +12 B. Types
0 B. Placement: core, if the owner approves (section 8, item 1). Otherwise 0.5, as an
added member with no version change.

### 4.3 V3. errors filters REQUEST by token

`near-misses.ts` filters `view.providers.filter((p) => p.token !== REQUEST)`, with
`REQUEST` from `@nexusdi/core`. No public API change.

Bytes, measured: errors fixture +4 B. Placement: core, in step 3 of section 2.7.

### 4.4 V4. Graph providers carry `internal` (accepted part)

In `@nexusdi/devtools`, each entry of `NexusGraph['providers']` gains:

```ts
internal: boolean;
```

`graphOf` sets it to `p.token === REQUEST`, and `labels.ts:40` loses its `'request'`
literal. `drawnProviders` keeps a provider when `!p.internal`, or when an edge from a
drawn provider reaches it. The renderers and `parseGraph` (V5) share the one field, and
`--format json` output carries it.

Bytes, est.: devtools +10 B. Placement: #61, since `labels.ts` is new in that PR.

### 4.5 V5. devtools owns the graph schema

In `@nexusdi/devtools`:

```ts
/** A NexusGraph read from JSON.parse output, checked field by field. Throws DevtoolsError NEXUS_DEVTOOLS_GRAPH_INVALID. */
export function parseGraph(value: unknown): NexusGraph;
```

`DevtoolsError` gains the code `NEXUS_DEVTOOLS_GRAPH_INVALID`, declared in
`NexusErrorByCode`, and a `path: string | null` field, null for
`NEXUS_DEVTOOLS_UNREGISTERED`. The error carries inline text, because no container runs
(2.5.1). cli's `DevtoolsApi` (`libs/cli/src/devtools.ts`) gains `parseGraph`. The cli
keeps its own `JSON.parse` error (exit 2) and maps any NexusError that `parseGraph`
throws to exit 2 with `isNexusError(error)`, and names no devtools code. `graph-json.ts`
is deleted from cli in the same PR. The cli already requires devtools at its own exact
version, so the schema always matches.

Bytes, measured: 0 B in app bundles, because `parseGraph` tree-shakes out of an app that
does not import it (devtools fixture unchanged). devtools' full export surface grows by
868 B (22,949 to 23,817, V2's +8 included), which the same code leaves in cli. Neither
package is in a production bundle. Placement: #61, before merge.

### 4.6 V6. cli classifies errors with `isNexusError`

cli's `nexusCode` becomes `isNexusError(error) ? error.code : null`, with `isNexusError`
from `@nexusdi/core`, a declared peer. The `NEXUS_BLUEPRINT_INVALID` compare stays under
P1's exception. No public API change.

Bytes: 0 B in app bundles. Placement: #61.

### 4.7 V7. Core exports its naming helpers

In `libs/core/src/index.ts`, from the existing `definitions/token.ts`,
`definitions/describe.ts` and `definitions/brand.ts`:

```ts
/** The name core's errors, graph() and trace events use for a token. */
export function displayName(token: unknown): string;
/** A short description of any value, as core's `received` fields write it. */
export function describeValue(value: unknown): string;
/** True when another copy of @nexusdi/core made `value`. */
export function isForeign(value: unknown): boolean;
```

testing's `describe.ts` is deleted and its imports point at core. testing's `otherCopy`
on core errors becomes correct, because only core holds the set `isForeign` reads. The
three functions go on the main entry: a plugin raises errors from its main bundle, and
`@nexusdi/core/text` would load core's whole pack in unbundled imports. A
`@nexusdi/core/plugin` subpath would keep them off the main export list, but it adds an
entry point users must learn, and D9 prefers fewer subpaths. The docs list them on the
plugin API page, away from the first page.

Bytes, measured: core fixture 0 B. Core full export surface +38 B with V2 included (the
tech lead's figure is about +30 B). testing fixture -218 B (19,516 to 19,298).
Placement: core, if the owner approves (section 8, item 2).

### 4.8 V8. interceptors uses core's naming

interceptors' `nameOf` becomes `displayName` and `describe` becomes `describeValue`.
`keyName` stays, because method keys are interceptors' own vocabulary. Some interceptor
messages change to core's wording (`the string "x"`), in unreleased text. No public API
change.

Bytes, measured: interceptors fixture -4 B. Placement: #62 rebase, after V7 merges on
`feat/core-0.4`.

### 4.9 V10. federation text moves to a pack

In `@nexusdi/federation`:

```ts
// @nexusdi/federation/text
export const federationText: ErrorTextPack;
```

`federationText` holds today's `NEXUS_CONTRACT_VERSION` wording, the major-0 branch
included. `contractVersion` builds the error with fields only. The app writes
`errors({ text: [federationText] })`. Without it, the user sees core's line and no
"Fix:" sentence (section 2.5.8). The docs page for the code carries the fix and the
wiring line. Federation is new in 0.4, so no 0.3 user sees a change.

Bytes, measured: federation fixture -119 B (18,784 to 18,665). The pack is est. 150 B,
opt-in. Placement: this spec (sections 2.3, 2.7), then core.

### 4.10 V11. react's render-time codes carry text in development

In the react spec section 14: `NEXUS_REACT_NO_PROVIDER`, `NEXUS_REACT_NESTED_SCOPE`,
`NEXUS_REACT_SECTION_CONFLICT` and `NEXUS_REACT_TRANSIENT_IN_RENDER` are raised with
`NexusErrorOptions.text`. The package builds the text only when
`process.env.NODE_ENV !== 'production'`, through the `dev` constant that section 16
already uses, so the package reads the environment in one place. In production the user
sees core's line with fields and the docs link. The per-package text test of section
2.5.1 covers the four codes. No public API change.

Bytes, est.: 0 B in production, about 300 B in development. Placement: react spec
sections 14 and 15 (bundle table).

### 4.11 V12. Adapters map any NexusError to a status

In the integrations spec 3.6 and 3.7: every `NexusError` the adapter catches from
`createScope`, `scope.resolve`, `ship.load` or `scope.extend` maps to 500 and log level
error, except `isNexusError(error, 'NEXUS_DISPOSED')`, which maps to 503 and warn. The
3.6 table becomes examples. Each adapter's test adds a third-party `errorBase` code
thrown from a plugin `construct` hook during `createScope`, and asserts 500 with no
`NEXUS_` in the body. No public API change.

Bytes, est.: -20 B per adapter. Placement: integrations spec.

### 4.12 V14. The devtools contribution points join plugin API 1

Section 2.5.11 lists `GraphAnnotator` and `GraphNote` under plugin API 1, with the V2
and V7 additions if the owner approves them. `plugin-api-1.test-d.ts` (P3) covers each
entry. Bytes: 0 B. Placement: this spec.

### 4.13 V15. Construct receives the check view's providers

PR #62 keeps pending compiles and matches a container to one by provider id, token and
module. A compile that passes interceptors' check and then fails (another plugin's check,
or module options validation before the first build) stays pending. It can later fail an
unrelated `create` with a false `NEXUS_INTERCEPTORS_SHARED`, and a compile that never
builds holds its tokens for the plugin's lifetime. No core hook today tells a plugin which
compile a `construct` call belongs to.

Guarantee, added to core spec 3.10.3 and 3.10.4:

> When a compile succeeds, the `provider` that `construct` receives is the same
> `ProviderView` object that the compile's `compile.check` hooks received in
> `view.providers`. Core keeps these objects for as long as the blueprint lives.

Core change: `PROVIDER_VIEWS` moves from `runtime/build.ts` to `blueprint/views.ts`, which
gains `adoptView(bp, view)`. It fills `PROVIDER_VIEWS` from `view.providers`. `compile()`
calls it on the frozen blueprint when it built a check view. `compile()` is the only
blueprint producer, and every `applyConstruct` call reads `providerViewIn`, so each
construct site gets the check's objects. The records and `rewrittenBy` are the ones the
blueprint holds, so each view's fields are unchanged. No type changes.

Memory: with a check hook registered, the blueprint keeps one frozen view per provider and
a map of them, also for providers it never constructs. The blueprint already holds one
record per provider, so the order is the same. The rest of the check view (modules, edges,
`visible`) is freed. A failed compile keeps nothing.

Plugin API: `NEXUS_PLUGIN_API` stays 1. The guarantee narrows behaviour that API 1 already
allowed, since core spec 3.10 promised nothing about view identity, and no release has
published API 1. It is a P3 contribution point: a third party can key a `WeakMap` on the
check's provider views the same way. A core runtime test asserts the identity for
`create` and `load`, since `plugin-api-1.test-d.ts` checks types only.

Interceptors (PR #62) then deletes `PendingCompile`, `state.pending`, `candidates`,
`matched`, `sameCompile`, `agrees`, `claim`, the candidate loop of `compiledFor` and the
`load` matching block. `compile.check` writes `WeakMap<ProviderView, CompiledProvider>`
(merged with `plans`), and `construct` reads it by `provider`. `sessionFor` reports
`NEXUS_INTERCEPTORS_SHARED` only while another container is live. The interceptors spec
drops R9's "Remaining limits" bullet and rewrites its pending-compile bullet. Both limits
go away.

Bytes, measured on `feat/core-0.4` at f73c46c: core fixture +42 B (18,435 to 18,477),
full export surface +42 B. Placement: core, before rc.0 (section 5.1).

Rejected: `VIEWS.set(bp, view)` in `adoptView` (+4 B). It would pin every module and edge
view for the blueprint's lifetime and make `blueprint()` return the check's object, which
no plugin needs and no guarantee would cover. A `compile.done(view, ok)` hook (+34 B)
misses failures after compile and still ties no build to a compile. A numeric compile id
on views and blueprints (+33 B) fixes the false error only, since a number cannot key a
`WeakMap`.

### 4.14 Rejected and deferred

- V4, `GraphNote.internal`: deferred. It gives a note a second meaning as a visibility
  flag and makes `label` optional. Accepted debt: interceptors' registry and guard stay
  drawn in graphs for 0.4. An optional `GraphNote` member added later keeps plugin API 1.
- V9, testing's `/text` pack: rejected. Accepted debt: `NEXUS_OVERRIDE_UNUSED` and
  `NEXUS_OVERRIDE_EXPORTS` keep inline text under section 2.5.1's allowlist entry, and
  no pack can translate them.
- V13, `@nexusdi/http`: rejected for 0.4. Accepted debt: the four adapters keep guarded
  copies of `request-scope.ts` and `dispose-with-body.ts` under P4's exception. Adding an
  adapter or a code never forces an edit in another adapter, and after V12 the status
  helper is one line. The package can be published later with no user-visible change.

## 5. Placement

### 5.1 `feat/core-0.4`, before rc.0

In dependency order:

1. V7: export `displayName`, `describeValue` and `isForeign` from core; delete testing's
   `describe.ts`. V8 on PR #62 waits for this.
2. V15: `adoptView` and the construct identity test. PR #62's session rewrite waits for
   this.
3. V1: widen `NexusErrorCode`, and change `nexus-error.test-d.ts`.
4. Text-pack steps 1 and 2 (section 2.7): `@nexusdi/core/text`, `ErrorTextPack`,
   `ErrorTextKit`, `PluginContext.format`, the `errorBase` docs argument.
5. V2: `TraceEventByType`, `TraceEvent<K>` and `PluginContext.emit`. It edits
   `pluginContext()` after step 4 adds `format`. Only if the owner approves.
6. Text-pack step 3 with V3: the errors engine and the `REQUEST` filter.
7. V10, text-pack step 4: `@nexusdi/federation/text`. It needs `ErrorTextPack` and the
   engine for its test.
8. Text-pack step 5: devtools `text` and `annotate`, `inspect()` ordering.
9. Text-pack step 6 with V9: repo-checks, the extended 2.5.1 test and testing's
   allowlist entry.
10. The principle's tests: the P1 and P5 repo-checks, the P3 grep, the P4 grep, the P2
    type tests and `plugin-api-1.test-d.ts` with every point of section 2.5.11 that is
    merged by then.
11. Text-pack step 7: the `nearMisses` write-back, after PR #63.
12. Text-pack step 8: the core spec edits, including P1-P5.

### 5.2 RFC PRs and specs

- PR #61 (cli, devtools renderers), before merge: V4 accepted part, then V5 (`parseGraph`
  validates `internal`), then V6. The follow-up adds T10's `--text` and `--annotate` and
  T9's `notes` rendering.
- PR #62 (interceptors), on rebase: V8 after V7 merges, V15's session rewrite after V15
  merges, and the six text-pack steps of section 2.7.
- Interceptors spec: V15 in R9 (the pending-compile bullet, and "Remaining limits" goes).
- `feat/rfc-21-benchmarks`: none. Out of scope (section 1.1).
- React spec: V11 in sections 14 and 15.
- Integrations spec: V12 in sections 3.6 and 3.7. Section 3.7 keeps the guarded copies
  (V13) and cites P4's exception.
- This spec: V3 (2.5.5), V9 (2.3, 2.5.1), V10 (2.3, 2.5.8, 2.7), V14 (2.5.11). Applied
  in this revision.

## 6. Byte impact

esbuild `--minify`, ESM, gzip, fixture minus core (core spec 12.4). The text-pack column
is measured on the architect's prototypes except where marked est. The ruled-fixes
column gives each fix's delta as section 4 reports it, on the audit's method (section 3),
where the fixture includes core.

| Package                        | Today (`feat/core-0.4`) | PR #62 as is | Text packs         | Ruled fixes (delta)                                             |
| ------------------------------ | ----------------------- | ------------ | ------------------ | --------------------------------------------------------------- |
| `@nexusdi/core` (full fixture) | 18,297                  | 18,297       | est. 18,337 (+40)  | +8 measured (V2); +42 measured (V15); V1, V7 0 B                |
| `@nexusdi/core/text`           | n/a                     | n/a          | ~3,714, via errors | 0                                                               |
| `@nexusdi/errors`              | 4,342                   | 5,645        | 4,416              | +4 measured (V3)                                                |
| `@nexusdi/devtools`            | 4,691                   | 6,032        | est. 4,830         | +12 measured on a fixture with core (V2); +10 est. (V4); V5 0 B |
| `@nexusdi/interceptors`        | n/a                     | 3,702        | est. 4,050         | -4 measured (V8)                                                |
| `@nexusdi/interceptors/text`   | n/a                     | n/a          | ~1,000, opt-in     | 0                                                               |
| `@nexusdi/testing`             | 1,233                   | 1,233        | 1,233              | -218 measured (V7); V9 0 B                                      |
| `@nexusdi/decorators`          | 1,321                   | 1,321        | 1,321              | 0                                                               |
| `@nexusdi/federation`          | 500                     | 500          | 500                | -119 measured (V10)                                             |
| `@nexusdi/federation/text`     | n/a                     | n/a          | n/a                | est. ~150, opt-in (V10)                                         |
| `@nexusdi/node`                | 89                      | 89           | 89                 | 0                                                               |

The `errors` figure includes core's text, which it imports from `@nexusdi/core/text`.
The interceptors figure includes the inline sites of section 2.5.12 and the
`context.format` calls. The size report replaces each est. when the work merges.

Measured at `feat/core-0.4` 7625733, fixture minus core except core's own row:

- `@nexusdi/core`: 18,552 B, against est. 18,446 plus about 90 B (+42 V15, +8 V2,
  about +40 text packs).
- `@nexusdi/core/text`: 3,869 B.
- `@nexusdi/federation`: 367 B.
- `@nexusdi/federation/text`: 171 B.

Outside the fixtures:

- `@nexusdi/core` full export surface: +38 B measured with V2 and V7 (18,687 to 18,725),
  and +42 B measured with V15.
- `@nexusdi/devtools` full export surface: +868 B measured (V5), moved out of cli.
- `@nexusdi/react` (spec): 0 B in production, about 300 B est. in development (V11).
- Each integrations adapter (spec): est. -20 B (V12).
- `@nexusdi/cli` is not in app bundles.

## 7. Public API changes

`@nexusdi/core`:

- Adds types `ErrorTextPack` and `ErrorTextKit`.
- Adds the entry `@nexusdi/core/text`, exporting `coreText: ErrorTextPack`.
- Adds `PluginContext.format(error)`.
- `errorBase(code, name, docs?)` gains the optional docs base URL.
- `NexusError`'s constructor gains an optional fifth `docs` argument, which `errorBase`
  passes. The default base lives in `lineOf`.
- `formatThrown` writes `nearMisses` back for any error with an own `nearMisses`
  property. Behaviour only, no signature change.
- `NexusErrorCode` becomes `keyof NexusErrorByCode` (V1).
- Adds the interface `TraceEventByType`. `TraceEvent` gains the type parameter `K`, and
  `TraceEvent` with no argument is the same union as today. Adds
  `PluginContext.emit(make)` (V2, if approved).
- Adds `displayName`, `describeValue` and `isForeign` to the main entry (V7, if
  approved).
- Guarantees that `construct` receives the `ProviderView` objects of the compile's check
  view (V15). Behaviour only, no signature change.

`@nexusdi/errors`:

- `errors()` becomes `errors(options?: ErrorsOptions)` with `text`.
- `explain(error, view?)` becomes `explain(error, options?: ExplainOptions)` with `view`
  and `text`. A breaking change to unreleased API.
- Adds types `ErrorsOptions` and `ExplainOptions`.
- Removes the internal `BUILDERS` table and PR #62's `INTERCEPTOR_BUILDERS`. Neither was
  exported.

`@nexusdi/devtools`:

- `DevtoolsOptions` gains `text` and `annotate`.
- `inspect()` options gain `text` and `annotate`. Its internal formatter moves after
  `options.plugins`.
- Adds types `GraphAnnotator` and `GraphNote`.
- `NexusGraph` providers gain `notes: string[]` and `internal: boolean` (V4), which also
  appear in `--format json` output.
- Adds `parseGraph(value: unknown): NexusGraph` and the code
  `NEXUS_DEVTOOLS_GRAPH_INVALID` on `DevtoolsError`, with a `path: string | null` field,
  null for `NEXUS_DEVTOOLS_UNREGISTERED` (V5).

`@nexusdi/federation`:

- Adds `@nexusdi/federation/text`, exporting `federationText` (V10).
- `NEXUS_CONTRACT_VERSION` carries a one-line message unless `federationText` is
  registered.

`@nexusdi/interceptors` (PR #62):

- Adds `@nexusdi/interceptors/text`, exporting `interceptorsText`.
- Adds `@nexusdi/interceptors/devtools`, exporting `interceptorNotes`.
- Adds `@nexusdi/devtools` as an optional peer dependency (types only).
- Invalid options throw at `create` or `Nexus.check` inside the `BlueprintError`. PR #62
  throws them at the `interceptors()` call.
- Decorator-time, construct-hook and `NOT_READY` errors carry full inline text.
- Messages name tokens and values with core's wording (V8).

`@nexusdi/cli` (PR #61 and follow-up): adds `--text` and `--annotate`. Exit code 2 now
covers any NexusError, third-party codes included (V6), and an invalid graph JSON file:
its own `JSON.parse` error and any NexusError that `parseGraph` throws (V5).

`@nexusdi/react` (spec): the four `NEXUS_REACT_*` codes carry full text outside
production (V11).

Integrations adapters (spec): any NexusError maps to 500, except `NEXUS_DISPOSED` to 503
(V12).

`@nexusdi/testing`, `@nexusdi/decorators`, `@nexusdi/node`: no public change.

## 8. Owner decisions and open questions

The tech lead's divergences, each with the recommendation:

1. V2: core grows by 8 B (devtools fixture by 12 B), and plugin API 1 gains
   `PluginContext.emit` and `TraceEventByType` before rc.0, with no first-party user.
   Recommendation: approve. Fallback: defer to 0.5, which breaks nothing.
2. V7: core's main entry gains `displayName`, `describeValue` and `isForeign`. 0 B in
   apps, about +30 to +38 B on the full export surface. Recommendation: approve.
3. V9: the approved text-pack spec said testing's errors are unreachable by a formatter,
   which is wrong for the two override codes. Recommendation: keep them inline and record
   one exception to section 2.5.1 (applied in this revision). The other option is the
   architect's hidden trailing plugin (section 2.8).
4. V10: the approved spec said federation does not change. Under the ruling federation
   moves its text to `@nexusdi/federation/text`, and a user without that pack loses the
   "Fix:" sentence of `NEXUS_CONTRACT_VERSION`. Recommendation: confirm. The docs site
   then needs a page for `NEXUS_CONTRACT_VERSION` with the full text and the wiring line
   before federation is released.
5. V11: `@nexusdi/react` strips its error text in production with a `NODE_ENV` guard,
   which section 2.8 rejects as option C2 for core. Recommendation: approve the guard for
   react only.
6. V13: the architect proposes reversing integrations 2.1 item 2 with a new
   `@nexusdi/http` package. Recommendation: keep the owner's decision; P4 carries a named
   exception for the adapter copies.
7. V5: `@nexusdi/devtools` gains a public `parseGraph` and the code
   `NEXUS_DEVTOOLS_GRAPH_INVALID`, and its export surface grows by 868 B moved out of
   cli. 0 B in app bundles. Recommendation: approve as growth in the right owner.
8. V4: plugin plumbing (interceptors' registry and guard) stays drawn in graphs for 0.4.
   If the owner wants it hidden before rc.0, `GraphNote.internal` is the design, at about
   +20 B in devtools. Recommendation: defer, and revisit when PR #62's graph output is
   reviewed. Related open question: `graph()` on a live container could mark providers
   whose `construct` hook returned a new object, which needs no annotator. Core would
   record it on the build path, which PR #63 guards for speed. Deferred until the
   benchmark of core spec 17.3 prices it.
9. Rule set: R6 leaves the general list and stays as section 2.5.1, and R3 and R7 merge
   into P3. Text-pack requirement R3 now points to P1-P5, and step 8 of section 2.7
   records them in the core spec. Recommendation: approve.

Open question outside the rulings:

- The docs site needs a page per first-party code for `NEXUS_INTERCEPTOR_*` before
  interceptors is released, each showing the full text and the `errors({ text })` line.
