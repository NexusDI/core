# Package-owned error text and open integration points

Status: draft, 2026-09-30. Built from the architect's design A and the tech lead's
amendments. Amends the core 0.4 spec (`specs/2026-09-23-core-0.4-design.md`) sections
D15, 3.10.6, 9, 9.1, 10 and 12.1, and replaces owner decision O5 of the interceptors spec
(`specs/2026-09-29-interceptors-design.md` on `feat/rfc-17-interceptors`).
Packages: `@nexusdi/core`, `@nexusdi/errors`, `@nexusdi/devtools`,
`@nexusdi/interceptors` (PR #62), `@nexusdi/cli` (PR #61). `@nexusdi/testing`,
`@nexusdi/decorators`, `@nexusdi/federation` and `@nexusdi/node` do not change.
Depends on: `feat/core-0.4` (plugin API of section 3.10, thin errors of D21), PR #63
(`format.ts` under `HOOK_SITES`), PR #62 and PR #61, none merged yet. No release has
shipped plugin API 1, `@nexusdi/errors` or `@nexusdi/devtools`, so every change below is
a change to unreleased API.

## 1. Context

D15 took core's message text out of core and put it in `@nexusdi/errors`, which formats
through the `formatError` hook. Section 9 then said each optional package writes its own
errors' full text inline. PR #62 departed from that: it added
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

The owner's goal: "I just want to make it easy for third-party packages to integrate
with our errors package (and other packages), and don't want to have to update a package
just because another one adds a new error or something."

## 2. Requirements

- R1. A third-party package contributes error text, near misses and `explain()` output
  to `@nexusdi/errors` through a public, stable contribution API, with no change to
  `@nexusdi/errors`.
- R2. A new error in package A never requires a release or a code change in
  `@nexusdi/errors` or any other package. `@nexusdi/errors` holds no per-package tables.
- R3. The same open-extension rule holds for the other cross-package integrations: at
  least devtools (`graph()`, `inspect()`) and testing (overrides).
- R4. A package degrades cleanly when an optional dependency such as `@nexusdi/errors` is
  not installed.

Every choice below is also checked against the pillars of core spec section 0:
lightweight core, not complicated, developer friendly, users first, and one version for
all packages.

## 3. Decision

Each package writes the text of its own errors as a text pack: a plain object that maps
the package's error codes to functions returning `ErrorText`. The pack lives in the
package that raises the errors, at its `/text` subpath. The contract types live in core
and are type-only. `@nexusdi/errors` becomes an engine with no text of its own: it takes
packs through `errors({ text })` and `explain(error, { text })`, and devtools passes them
on through `devtools({ text })` and `inspect(root, { text })`. The engine always adds
core's pack, which moves to `@nexusdi/core/text`. No package imports `@nexusdi/errors`
except devtools, so no package has anything to detect when it is missing.

An error that no formatter can reach carries its own text inline, as testing,
federation, decorators and devtools already do. That rule decides, site by site, which
errors are thin and which are inline (section 5.1).

## 4. Where this departs from the owner's earlier wording

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
  needs one of two things. The text could ship in the package's production bundle for
  every user (+1.2 to 1.4 KB for interceptors), or core could discover packages at
  runtime, which D19 rejects. The one-line message of an unwired error links to the
  package's docs page for that code, and that page shows the full text and the wiring
  line (section 5.7).
- The owner prefers discrete packages over subpaths. Packs use a subpath (section 5.9).
- Core spec section 9 said "Each package writes its own errors' full text, since the
  package is optional already." This spec narrows that to errors no formatter reaches.
  Errors a container formats stay thin and get their text from the package's pack.
- Interceptors spec O5 put interceptor text in `@nexusdi/errors`. This spec reverses it:
  R2 forbids it, and it charged 1,305 B to every `errors()` user.

## 5. Design

### 5.1 Where text lives

A package writes each error's text in one of two places, by one rule:

- Inline, with `NexusErrorOptions.text`, when the error is raised where no container
  formatter runs: at decorator evaluation, at module load, inside a plugin hook whose
  throw core wraps as a cause, or while the plugin has no `PluginContext` yet. Core never
  rewrites an inline message (`ownsText`).
- In the package's text pack, for every other error: errors raised inside a container
  operation, reported by `compile.check`, or formatted by the plugin through
  `PluginContext.format` (section 5.6).

A package declares each code once, in `NexusErrorByCode`. Each first-party package has a
test that fails when a declared code has neither a pack entry nor an inline raise site.

### 5.2 The pack contract

In `@nexusdi/core`, type-only:

```ts
/** Text for the codes one package raises. Keys are codes from NexusErrorByCode. */
export type ErrorTextPack = {
  readonly [C in keyof NexusErrorByCode]?: (
    error: NexusErrorByCode[C],
    view: BlueprintView | undefined,
    kit: ErrorTextKit,
  ) => ErrorText | undefined;
};

/** What @nexusdi/errors lends a pack. Grows by adding members only. */
export interface ErrorTextKit {
  /** Where `token` exists that `moduleId` cannot see. Empty without a view. */
  nearMisses(token: unknown, moduleId: string): readonly NearMiss[];
}
```

`ErrorText` and `NearMiss` are already public. A pack entry that returns `undefined`
leaves the error to the next pack. A third-party package ships its errors and its pack
together:

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

The pack reads the error's fields, and the error class and the pack ship in the same
package at the same version, so they cannot drift apart. That is why text lives with the
raising package.

### 5.3 Registration

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
  (section 6.3).

A project that registers `errors()` in production and `devtools()` in development shares
one list: `const text = [interceptorsText, cacheText]`.

The engine reads a pack entry with `Object.hasOwn(pack, error.code)`, so a code named
after an `Object.prototype` key never calls inherited code.

### 5.4 Ordering

- Across plugins: unchanged. The first `formatError` hook in the `plugins` array that
  returns text decides (core spec 3.10.2).
- Inside one `errors()`, `devtools()`, `inspect()` or `explain()` call: the caller's
  packs in array order, then core's pack. A pack listed earlier overrides a later one for
  the same code, so a translation pack for core's codes works by listing it.
- `inspect()` puts its internal formatter after the caller's plugins (section 6.3).

### 5.5 Near misses

The near-miss search (`near-misses.ts`) stays in `@nexusdi/errors`. It reads only the
public `BlueprintView` and `Token`. Packs reach it through `kit.nearMisses`, so no pack
imports `@nexusdi/errors`. Core's `MissingProviderError` keeps its hidden `lookup`, and
core's own pack reads it, so that contract stays inside core. A third-party error that
wants near misses stores what it looked up with `NexusErrorOptions.hidden` and passes it
to the kit.

`formatThrown` writes `text.nearMisses` back to the error when the error has an own
`nearMisses` property, whatever its class. Today the check is
`error instanceof MissingProviderError`. The edit is in `format.ts` and goes in after
PR #63.

### 5.6 Formatting outside a container operation

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

### 5.7 Docs links for thin messages

`errorBase` takes an optional third argument, the docs base URL, defaulting to
`DOCS_URL`. `lineOf` ends the one-line message with that base and the code. First-party
packages keep the default and host a page per code on nexus.js.org. A third-party
package passes its own base. Each package's docs page for a code shows the full text and
the line that registers the pack, so a user who forgot the pack reaches that page from
the message. Est. +20 B in core.

### 5.8 Degradation when an optional package is absent

- `@nexusdi/errors` not installed: nothing imports it. Core writes one-line messages with
  the owning package's docs link. Inline-text errors keep their full text.
- `@nexusdi/errors` installed, a package's pack not registered: that package's codes get
  no pack entry, `explain()` returns `undefined`, and the one-line message stays. Core's
  codes still get full text, because the engine always adds core's pack.
- A pack registered for a package the app does not use: its entries never match. The pack
  costs its own bytes (about 1 KB for interceptors) and nothing else.
- `@nexusdi/devtools` not installed: `@nexusdi/interceptors/devtools` is the only module
  that names it, with a type-only import, and the app does not import that module.
  `@nexusdi/devtools` is an optional peer of `@nexusdi/interceptors`.
- `@nexusdi/devtools` keeps its hard dependency on `@nexusdi/errors`. The errors engine is
  part of devtools.

### 5.9 Entry points and tree-shaking

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
can, unless it pins an exact peer. Each discrete package also costs about 12 boilerplate
files plus fallow, `verify-packaging`, commitlint scope and size-report wiring, and the
package count doubles. `scripts/verify-packaging.mjs` already checks every `exports`
entry, so subpaths need no new tooling.

### 5.10 Core's text

Core's builders move from `libs/errors/src/{builders,reasons,describe-thrown}.ts` to
`libs/core/src/text/`, exported as `coreText` from `@nexusdi/core/text`. Their text is
unchanged, and the revision 1 error tests still pass with `errors()` registered (core
spec section 17). A new core error is then one change inside `libs/core`, which R2
requires. Core's main bundle does not change. Core's tarball grows by about 20 KB raw of
source, in a package every user already installs.

Core spec 12.1 changes. Core gains `text/`, which imports only types from `errors/`,
`blueprint/views.ts` and `definitions/`, and nothing in core imports `text/`. Optional
packages import `@nexusdi/core` and `@nexusdi/core/text` and nothing else of core. Among
first-party packages only `@nexusdi/errors` imports `@nexusdi/core/text`.

### 5.11 Plugin API version and contract stability

`NEXUS_PLUGIN_API` stays 1. `ErrorTextPack`, `ErrorTextKit` and `PluginContext.format`
join plugin API 1 and follow core spec 3.10.2. A new `ErrorTextKit` member, a new
optional `ErrorText` field or a new `PluginContext` member does not raise the version. A
change that breaks a pack written for version N raises it to N + 1. A pack carries no
version of its own. It matches its package's error fields because both ship in one
package, and it matches the engine because the kit only grows. Lockstep versions keep
first-party packs, core and the engine at one version.

### 5.12 Interceptors under this rule

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

## 6. R3: other integrations

### 6.1 Testing overrides

Already meets R3. `@nexusdi/testing` places `nexus:testing` ahead of the caller's plugins
(`libs/testing/src/index.ts`). `override()` works on any token, including tokens that a
plugin's contributed modules provide, and on interceptor tokens. `@nexusdi/testing`
imports no other `@nexusdi` package, so a new package needs no change in testing. No fix.

### 6.2 devtools text

Gap: `devtools.ts` and `inspect.ts` call `explain(error, view)`, which only knows core's
text. Fix: `devtools({ text })` and `inspect(root, { text })` pass packs to `explain()`
(section 5.3).

### 6.3 inspect()

Plugins already meet R3: `inspect()` passes `options.plugins` to `Nexus.check`. Gap: the
internal `nexus:inspect` formatter runs ahead of the caller's plugins, so its core-only
`explain()` shadows a caller's translation pack for core codes. Fix: the internal plugin
goes after `options.plugins`, and formats with `options.text` plus core's pack.

### 6.4 graph()

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

### 6.5 CLI

`nexusdi graph --plugins file#export` passes an array to `inspect()`. After section 6.3,
an `errors({ text })` in that array formats as it does in the app. A follow-up to PR #61
adds `--text file#export` and `--annotate file#export`, each an array, passed as
`inspect()`'s `text` and `annotate`. `@nexusdi/cli` imports no pack itself.

## 7. Byte impact

esbuild `--minify`, ESM, gzip, fixture minus core (core spec 12.4). Measured on the
architect's prototypes except where marked est.

| Package                        | Today (`feat/core-0.4`) | PR #62 as is | This design        |
| ------------------------------ | ----------------------- | ------------ | ------------------ |
| `@nexusdi/core` (full fixture) | 18,297                  | 18,297       | est. 18,337 (+40)  |
| `@nexusdi/core/text`           | n/a                     | n/a          | ~3,714, via errors |
| `@nexusdi/errors`              | 4,342                   | 5,645        | 4,416              |
| `@nexusdi/devtools`            | 4,691                   | 6,032        | est. 4,830         |
| `@nexusdi/interceptors`        | n/a                     | 3,702        | est. 4,050         |
| `@nexusdi/interceptors/text`   | n/a                     | n/a          | ~1,000, opt-in     |
| `@nexusdi/testing`             | 1,233                   | 1,233        | 1,233              |
| `@nexusdi/decorators`          | 1,321                   | 1,321        | 1,321              |
| `@nexusdi/federation`          | 500                     | 500          | 500                |
| `@nexusdi/node`                | 89                      | 89           | 89                 |

The `errors` figure includes core's text, which it imports from `@nexusdi/core/text`.
The interceptors figure includes the inline sites of section 5.12 and the
`context.format` calls. `@nexusdi/cli` is not in app bundles. The size report replaces
each est. when the work merges.

## 8. Public API changes

`@nexusdi/core`:

- Adds types `ErrorTextPack` and `ErrorTextKit`.
- Adds the entry `@nexusdi/core/text`, exporting `coreText: ErrorTextPack`.
- Adds `PluginContext.format(error)`.
- `errorBase(code, name, docs?)` gains the optional docs base URL.
- `formatThrown` writes `nearMisses` back for any error with an own `nearMisses`
  property. Behaviour only, no signature change.

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
- `NexusGraph` providers gain `notes: string[]`, which also appears in `--format json`
  output.

`@nexusdi/interceptors` (PR #62):

- Adds `@nexusdi/interceptors/text`, exporting `interceptorsText`.
- Adds `@nexusdi/interceptors/devtools`, exporting `interceptorNotes`.
- Adds `@nexusdi/devtools` as an optional peer dependency (types only).
- Invalid options throw at `create` or `Nexus.check` inside the `BlueprintError`. PR #62
  throws them at the `interceptors()` call.
- Decorator-time, construct-hook and `NOT_READY` errors carry full inline text.

`@nexusdi/cli` (follow-up to PR #61): adds `--text` and `--annotate`.

`@nexusdi/testing`, `@nexusdi/decorators`, `@nexusdi/federation`, `@nexusdi/node`: no
change.

## 9. Migration per branch

Merge order: PR #63, then the `feat/core-0.4` changes, then PR #62 rebased, then PR #61
and its follow-up.

`feat/core-0.4`:

1. Move `builders.ts`, `reasons.ts` and `describe-thrown.ts` to `libs/core/src/text/`,
   typed as `ErrorTextPack`. Add the `./text` export to core's `package.json`, and to
   `verify-packaging` and the size fixture.
2. Add `ErrorTextPack`, `ErrorTextKit`, `PluginContext.format` and the `errorBase` docs
   argument.
3. Rework `@nexusdi/errors` to the engine plus the registry: `errors({ text })`,
   `explain(error, { view, text })`, the kit, and the `Object.hasOwn` lookup.
4. `@nexusdi/devtools`: `text` and `annotate` options, `inspect()` ordering,
   `GraphAnnotator`, `notes` on providers.
5. Update `tools/repo-checks`: allow `@nexusdi/core/text`, and fail when a main entry
   imports its own `text/` or `devtools/` module.
6. Generic `nearMisses` write-back in `format.ts`, on top of PR #63's `HOOK_SITES` form.
7. Edit the core spec: D15 (text lives with the raising package, core's in
   `@nexusdi/core/text`), 3.10.1 (`PluginContext.format`), 3.10.6, 9 (the rule of section
   5.1 replaces the inline-text sentence), 9.1, 10 and 12.1.

PR #62:

1. Delete `libs/errors/src/interceptors.ts`, its test and the `BUILDERS` spread.
2. Add `libs/interceptors/src/text.ts` as `interceptorsText`, exported at `./text`,
   carrying the `interceptors.test.ts` expectations.
3. Apply section 5.12: inline text at decorator, construct-hook and `NOT_READY` sites,
   options validation into `compile.check`, and `context.format` at the remaining
   call-time sites.
4. Add `./devtools` with `interceptorNotes` and the optional devtools peer. This step
   waits for PR #61's `render/` files.
5. Teach `size-report.mjs` a pack fixture. It measures only `${dir}.ts` today.
6. Replace O5 in the interceptors spec, and fix the lightweight row of section 1 and the
   size numbers of section 8.

PR #61: merges as it is. It touches no errors file. The follow-up adds `--text`,
`--annotate` and `notes` rendering in `render/labels.ts`.

PR #63: no change. The `format.ts` edit of step 6 above rebases onto it.

## 10. Rejected options

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
  interceptors. It gives a third party no way to translate or replace text. Section 5.1
  keeps C's strength where it counts: sites no formatter reaches.
- C2, inline text behind a `NODE_ENV` guard. A Node production process loses its text,
  and core spec section 0 treats Node as a first-class runtime with full messages in
  production logs.
- A plugin field such as `errorText` that core or `@nexusdi/errors` collects from the
  plugin list. The plugin factory would import its pack statically, so the text ships to
  every user. That is design C's byte cost plus a new core API that exposes the plugin
  list.
- Autoloading packs with a dynamic `import()` of an optional peer. The Vite 6.3.5 /
  Rollup 4.44 build fails when the peer is missing, and D19 rejects runtime discovery.
- A package dynamically importing its own `/text` on first error. `formatError` is
  synchronous, and a preload started at `interceptors()` makes text depend on timing.
- A global registry filled by a side-effect import. Core writes no global (SEC-011),
  containers would share text, and side-effect imports conflict with `sideEffects: false`.
- A discrete text package per package. Version skew against the error fields, and the
  package count doubles (section 5.9).
- Core's pack exported from core's main entry. Unbundled and CDN-bundled imports of core
  would carry 3.7 KB (section 5.9).
- Keeping core's text in `@nexusdi/errors`. A new core error would need a change in
  `@nexusdi/errors`, which R2 forbids.
- `GraphAnnotator` as a core type. Core would carry devtools vocabulary. The type lives in
  devtools, and a structural match needs no import.
- `@nexusdi/errors` returning a hint text for codes no pack covers. The first hook that
  returns text wins, so the hint would shadow any `formatError` plugin later in the array.
  The docs link of section 5.7 does the same job without shadowing.
- Core formatting a plugin hook's `NexusError` cause inside `NEXUS_PLUGIN_FAILED`. It
  changes the 9.1 rule that a wrapped cause keeps its text, and edits `format.ts` against
  PR #63. The two interceptor sites carry inline text.

## 11. Open questions

- `graph()` on a live container could mark providers whose `construct` hook returned a
  new object, which needs no annotator. Core would record it on the build path, which
  PR #63 guards for speed. Deferred until the benchmark of core spec 17.3 prices it.
- The docs site needs a page per first-party code for `NEXUS_INTERCEPTOR_*` before
  interceptors ships, each showing the full text and the `errors({ text })` line.
