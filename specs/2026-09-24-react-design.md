# @nexusdi/react: React bindings for NexusDI 0.4

Status: decided, 2026-09-28. The owner delegated the open decisions to an architect and a
tech lead. Section 17 records the ruling and the reason for each, and section 18 records
the core items with the exact text core adds.
Package: `@nexusdi/react` (new, published). Released in 0.4, targeting rc.0 with the other
adapters (core spec §0, D18).
Depends on:

- `specs/2026-09-23-core-0.4-design.md`, revision 2, on `plan/core-0.4-engine` at
  `ab6a3e8`. This package uses core's public API and the plugin API of core §3.10, and
  nothing else. Where it needs more, section 18 records the gap. It invents no core API.
- `specs/2026-09-23-integrations-design.md` on `spec/integrations` at `1de86ff`, for the
  React Router server side (`@nexusdi/react-router`, §7) and `@nexusdi/vitest` (§8).
- The wargame notes of 2026-09-24: frontend §3 and §6 (W3, W4, W5, W7), multi-team D8,
  synthesis C12 and C19.

Measured on npm 2026-09-24: `react` 19.3.0, `react-router` 8.4.0, `next` 16.3.6.

Prior art: React Redux (`Provider`, hooks over a store the app creates), TanStack Query
(a client the app creates, one per request on the server and one per tab in the browser),
`inversify-react` and `react-tsyringe` (container in context, a hook per lookup), Angular's
element injectors, `react-error-boundary`.

## 0. Summary

```text
<NexusProvider container={shipReady}>               // Nexus | Promise<Nexus>; a promise suspends
  <ScopeProvider request={{ mission }} fallback={<Docking />}> // a scope for the subtree, client only
    <SectionBoundary section={Cartography} fallback={<Loading />} errorFallback={Failed}>
      <StarMap />                                     // useService(NAV_CHARTS): sync get()
    </SectionBoundary>
  </ScopeProvider>
</NexusProvider>
const Cartography = lazySection('cartography', () => import('./cartography').then((m) => m.Cartography));
Nexus.create(Meridian, { plugins: dev ? [devtools(), react()] : [] }); // react(): transient check
```

The package is a context over a container the app creates, one hook that calls the sync
`get()`, a component that gives a subtree its own scope, and a component that runs
`load()` for a lazily imported module with a fallback and an error fallback. An optional
plugin, `react()`, lets `useService` reject transient tokens in render.

Pillars (core §0):

- P5: one supported shape for React, where each team would otherwise write its own
  context, hook, section boundary and HMR swap (synthesis C12).
- P2: two exports cover a single-team app (`NexusProvider`, `useService`). The scope and
  section components appear only on the pages that need them.
- P6: est. 1.2 to 1.6 KB gzip on top of core, split so an app that imports only the
  provider and the hook bundles only those two (section 15).
- P8: async startup is a promise the provider suspends on; `get()` stays sync, which is
  what hooks need (frontend §3.1).
- P3: sections are modules loaded through core's validated `load()`.

## 1. Problem

The React Router adapter is server-only by design: its Vite plugin strips `loader`,
`action`, `middleware` and `.server` modules from the client build, and its integration
test asserts the client bundle contains no `@nexusdi/core` module (integrations §7.2).
Components never see a container. A browser shell whose section components need
`AUTH` or `TELEMETRY` has no package, which is the main multi-team case (multi-team §1).
Each team writes its own glue:

- A context and a hook around `get()`.
- A guard against transient tokens in render: `get()` of a transient builds a new
  instance on every render (frontend §3.1, problem 1).
- A subtree scope, which is hard because `createScope()` returns a promise and a render
  cannot await (frontend §3.1, problem 2).
- A section boundary that runs `load()`, shows a fallback, and catches a
  `BlueprintError`.
- An HMR swap: after a Vite update, components that hold the old container call `get()`
  on a disposed container and throw `NEXUS_DISPOSED` (frontend §3.4).

Core 0.4 constrains the design in four ways, and every section below follows from them:

1. `get()` is sync and `Nexus.create`, `load()` and `createScope()` are async (core §2.2).
2. Scopes do not nest. `Scope` has no `createScope`, and every scope is a child of the
   root (core §3.6).
3. A scope pins the blueprint current at its creation, and `await scope.extend()`
   re-pins it after a `load()` (core §7.4).
4. `load()` has no unload (synthesis C19 puts unload in 0.5).

## 2. The first page

The docs' React page opens with classes as tokens (core D8). Nothing here depends on
another class.

```tsx
// src/ship.ts
import { Nexus } from '@nexusdi/core';
import { FlightLog } from './flight-log';
import { StarCatalog } from './star-catalog';

export const shipReady = Nexus.create([FlightLog, StarCatalog]);
```

```tsx
// src/main.tsx
import { NexusProvider } from '@nexusdi/react';
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { shipReady } from './ship';

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<p>Powering up</p>}>
    <NexusProvider container={shipReady}>
      <StarList />
    </NexusProvider>
  </Suspense>
);
```

```tsx
// src/star-list.tsx
import { useService } from '@nexusdi/react';
import { StarCatalog } from './star-catalog';

export function StarList() {
  const catalog = useService(StarCatalog); // StarCatalog, sync
  return (
    <ul>
      {catalog.nearest(5).map((s) => (
        <li key={s.id}>{s.name}</li>
      ))}
    </ul>
  );
}
```

The second page moves to interfaces and tokens, with one sentence on why: a test binds
`STAR_CATALOG` to a fake, and the component does not change. Every later example in this
spec is interface-first.

```ts
// src/bridge/contracts.ts: interfaces and tokens only, importable from any bundle
export interface IStarCatalog {
  nearest(count: number): readonly Star[];
}
export const STAR_CATALOG = new Token<IStarCatalog>('StarCatalog');

export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
```

```ts
// src/bridge/bridge.module.ts
export const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    provide(STAR_CATALOG, { useClass: HttpStarCatalog }),
    provide(FLIGHT_LOG, { useClass: MemoryFlightLog, lifetime: 'scoped' }),
  ],
  exports: [STAR_CATALOG, FLIGHT_LOG],
});
```

```tsx
export function StarList() {
  const catalog = useService(STAR_CATALOG); // IStarCatalog
  return (
    <ul>
      {catalog.nearest(5).map((s) => (
        <li key={s.id}>{s.name}</li>
      ))}
    </ul>
  );
}
```

## 3. The public API

```ts
'use client';

export function NexusProvider(props: {
  container: Nexus | Promise<Nexus> | null;
  scope?: Scope; // the request scope during SSR (section 9.1)
  dispose?: boolean; // default false; true: the provider disposes containers it drops
  clientOnly?: boolean; // render fallback on the server and during hydration (section 9.2)
  fallback?: ReactNode; // rendered while container is null, or while clientOnly waits
  children?: ReactNode;
}): ReactElement;

export function useService<T>(
  token: MultiToken<T>,
  options?: LookupOptions
): readonly T[];
export function useService<T>(
  token: InjectionToken<T>,
  options?: LookupOptions
): T;
export function useContainer(): Nexus; // the root, for load() and createScope() in effects

export function ScopeProvider(props: {
  request?: NexusRequest;
  fallback?: ReactNode;
  children?: ReactNode;
}): ReactElement;

export function lazySection(
  name: string,
  loader: () => Promise<ModuleRef>
): LazySection;
export function SectionBoundary(props: {
  section: LazySection;
  fallback?: ReactNode;
  errorFallback?: ComponentType<{ error: unknown; retry(): void }>;
  onError?(error: unknown): void;
  children?: ReactNode;
}): ReactElement;

export function react(): NexusPlugin; // optional; enables the transient check
```

Every export is a named ESM export of one entry, with `"sideEffects": false`. The entry
starts with `'use client'` (section 10).

### 3.1 `NexusProvider` and the context

The app creates the container; the provider only publishes it. This is the React Redux
and TanStack Query model, and it keeps `Nexus.create` in plain code where a server, a
test and a browser each call it their own way.

The context value is an object the provider creates once per container:
`{ container, resolver, store }`. `resolver` is the scope given by the `scope` prop, or
the container. `store` holds the section cache, the scope bookkeeping and the MultiToken
memo (section 4.3). The context object itself is private: consumers use the hooks.

`container` accepts three forms:

- A `Nexus`. The provider renders its children with it.
- A `Promise<Nexus>`. The provider calls React 19's `use()` on it and suspends to the
  nearest `<Suspense>` until `create` settles (section 8). A rejected promise throws the
  `BlueprintError` or `ProviderError` to the nearest error boundary. The promise must be
  created outside render, usually at module level; a promise created in render is a new
  promise on every render, and React warns about it.
- `null`. The provider renders `fallback`. A Next.js app passes `null` on the server,
  with `clientOnly` (section 9.2).

A new `container` value swaps the container: the provider builds a new context value,
every consumer re-renders against the new container, every `ScopeProvider` below makes a
new scope, and every `SectionBoundary` below loads its section into the new container.
HMR relies on the swap (section 12).

`dispose` decides who disposes. With the default `false`, the provider never disposes
anything, because the code that called `Nexus.create` owns the container (`await using`
in a test, a shutdown hook in a server). With `dispose`, the provider disposes a
container when it stops rendering it: after a swap commits, and when the provider
unmounts. Disposal runs through the deferred release of section 6.3, so StrictMode's
simulated unmount does not dispose a live container. The HMR recipe of section 12 sets
`dispose`, and so can an app whose container lives exactly as long as its React root.

`useService` outside a provider throws `NEXUS_REACT_NO_PROVIDER` (section 14).
`useContainer()` returns the root even under a `ScopeProvider`, for code that calls
`load()` or `createScope()` itself in an effect or an event handler.

## 4. `useService`

### 4.1 A sync `get()`

`useService(T, options?)` reads the context and returns `resolver.get(T, options)`. It
is a plain hook: it holds no state and registers no effect. `options.module` passes
through as core's `LookupOptions`, so a component inside a section can read a token its
module keeps private: `useService(COURSE_PLOTTER, { module: Cartography })`.

What each lifetime does under each resolver:

| Lifetime  | Under the root (`NexusProvider`)                          | Under a scope (`ScopeProvider`, SSR `scope`)            |
| --------- | --------------------------------------------------------- | ------------------------------------------------------- |
| singleton | the one instance                                          | the root's instance (core §7.1)                         |
| scoped    | core throws `NEXUS_SCOPE_REQUIRED`                        | the scope's instance, built on first `get()`            |
| transient | a new untracked instance per render; `react()` rejects it | a new tracked instance per render; `react()` rejects it |
| alias     | the target's behaviour                                    | the target's behaviour                                  |

Errors from `get()` (`NEXUS_MISSING_PROVIDER`, `NEXUS_NOT_VISIBLE`,
`NEXUS_SCOPE_REQUIRED`, `NEXUS_DISPOSED`, `NEXUS_LOADED_AFTER_SCOPE`) propagate from
render to the nearest error boundary unchanged.

An `eager: false` singleton (core §6.6) builds on the first `useService` that asks for
it, synchronously, in render. Its constructor runs inside React's render phase, so it
must not set React state or read the DOM. The docs say so on the `eager: false` page.

### 4.2 Transients in render

A transient `get()` in render builds an instance on every render, and StrictMode builds
two per render in development. Under the root the instance is untracked (core §3.5), so
a disposable transient leaks. Under a scope the scope tracks every one of them until the
scope ends. Neither is ever what a component wants.

Blocking it needs the token's lifetime. A `Token<T>` carries no lifetime in its type
(frontend W7), so the type system cannot reject it, and core has no public lookup of a
token's lifetime. The plugin API has one: `setup` receives `context.blueprint()`, whose
`ProviderView.lifetime` and `visible()` give the lifetime of the provider a lookup
binds (core §3.10.1). So the check lives in an optional plugin, `react()` (section 5),
and `useService` runs it when the container has that plugin:

- The check runs before `get()`, so a rejected token builds nothing.
- `lifetime === 'transient'` throws `NEXUS_REACT_TRANSIENT_IN_RENDER`, naming the token
  and the fix: resolve it in an event handler or an effect through `useContainer()` or a
  scope, make it `scoped` and read it under a `ScopeProvider`, or bind a factory function
  the component calls.
- An alias follows its `alias` edges to the target's lifetime.
- A `MultiToken` with at least one transient contribution throws the same error.
- For `{ module: ref }`, the check resolves `ref` with core's `moduleDefinitionOf` and
  checks the module whose `definition` or `replaced` is that definition, which is the
  module core's `get()` selects (core §3.5, K6). A `@Module` class is a different object
  from its definition, so a plain `definition === ref` compare would skip every
  decorator user. A unit test covers `overrideModule` together with `{ module }`.
- When the view has no provider for the token, the check does nothing, and `get()`
  throws its own error.
- The result is cached per token for the current blueprint, so the check is one `Map`
  lookup after the first render of each token.

Decision (R4): register `react()` in development and in tests, beside `devtools()`, and
leave it out of production builds. The check guards against a coding mistake that shows
on the first render in development, so production gains nothing from it, and core builds
the blueprint views only when a plugin asks for them (core §3.10.1).

Consequences for users:

- A developer who resolves a transient in render gets a named error on the first render
  in development, with the fix in the message.
- An app that never registers `react()` gets no check. The docs page on transients says
  so, and `devtools()` does not include `react()`, because `devtools()` must not depend
  on a React package.
- The check depends on three core items (section 18, K1, K2 and K3), all decided for core
  0.4. Without K1 the plugin cannot find the root module's view, and the check cannot be
  released (R16 gives the rule if one of them is late).

Alternatives, rejected:

- Memoize every lookup per component (`useState(() => get(T))`). A transient becomes one
  instance per component instance, which needs no lifetime lookup. But StrictMode calls
  the initializer twice and drops one instance, a disposable transient has no owner to
  dispose it on unmount, and "transient" would mean "per component", which no other
  NexusDI host means by it.
- Make `react()` mandatory for `NexusProvider`. Every app would write one more line and
  build views in production for a development check (P2, P6).
- Run the check without a plugin by calling `get()` twice and comparing. It builds two
  instances to find out it should have built none.

### 4.3 `MultiToken` arrays

`get(MULTI)` returns a new array on every call (core §6.2), so a component that passes
the result to a child or a `useMemo` dependency would re-render every time. `useService`
of a `MultiToken` calls `resolver.get(token, options)` on every render and memoizes the
result in the provider's store, keyed by resolver, token and module. When the new array
has the same length and the same elements by `===` as the stored one, `useService`
returns the stored array. Otherwise it freezes the new array, stores it and returns it.
The array stays the same object while its contents do, under the root and under each
scope separately, and it changes after any `load()` that adds a contribution, whoever
ran it. `useService` subscribes to nothing: a component sees a new contribution on its
next render. A transient contribution makes a new array on every render, and `react()`
rejects it in development (section 4.2). The store write in render is safe under
concurrent rendering, because every render stores an array equal to its own `get()`.

### 4.4 Tokens from a section

A section's exports become visible to root `get()` after its `load()` (core §3.5). A
component inside the `SectionBoundary` renders only after that load, so
`useService(COURSE_PLOTTER)` works there. A component outside the boundary that reads a
section token before the section loads gets `NEXUS_MISSING_PROVIDER`, which is correct:
the shell did not load it.

## 5. The `react()` plugin

```ts
import { devtools } from '@nexusdi/devtools';
import { react } from '@nexusdi/react';

const dev = process.env.NODE_ENV !== 'production';
export const shipReady = Nexus.create(Meridian, {
  plugins: dev ? [devtools(), react()] : [],
});
```

The plugin is `{ name: 'nexusdi-react', apiVersion: 1, setup }`. `setup(context)` records
`context` in a module-level `WeakMap` keyed by `context.container`. `useService` looks
the container up in that map. It uses no other hook: no compile hook, no `construct`,
no `observe` (an `observe` hook would make core build a trace event and read the clock
for every construction, core §3.10.5).

Plugin API use, checked against core §3.10:

| Need                                        | Core API                                                                                               | Status        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| find the container a plugin is attached to  | `setup(context)`, `context.container`                                                                  | available     |
| lifetime of the provider root `get()` binds | `context.blueprint()`, `visible(view.root, token)`                                                     | core 0.4 (K1) |
| know the blueprint changed after `load()`   | `context.blueprint()` identity                                                                         | core 0.4 (K2) |
| lifetime through an alias                   | `edges` with `kind: 'alias'`                                                                           | available     |
| lifetime with `{ module }`                  | `moduleDefinitionOf(ref)`, then `modules[]` whose `definition` or `replaced` is it, then `visible(id)` | available     |
| contract tokens from `@nexusdi/federation`  | `visible()` maps through `tokenKey`                                                                    | core 0.4 (K3) |

`moduleDefinitionOf` is public in the core 0.4 plan (Task R8), and core.md does not yet
document it. The core controller confirms the export stays.

The components need no plugin: `NexusProvider`, `ScopeProvider` and `SectionBoundary`
call `get`, `createScope`, `load` and `scope.extend` on a container the app created, as
the server adapters do (integrations §3.10).

## 6. Subtree scopes

### 6.1 `ScopeProvider`

```tsx
// A survey console: one flight log per open console, disposed when it closes.
export function SurveyConsole({ mission }: { mission: Mission }) {
  return (
    <ScopeProvider request={{ mission }} fallback={<Docking />}>
      <FlightLogPanel />
    </ScopeProvider>
  );
}

function FlightLogPanel() {
  const log = useService(FLIGHT_LOG); // IFlightLog, scoped: one per SurveyConsole
  return (
    <ol>
      {log.entries().map((e, i) => (
        <li key={i}>{e}</li>
      ))}
    </ol>
  );
}
```

Behaviour:

1. On the server and during hydration, `ScopeProvider` renders `fallback`. It reads a
   hydration flag through `useSyncExternalStore`, whose server snapshot is `false`, so
   the client's hydration render matches the server HTML.
2. After it mounts, an effect acquires a scope from the store:
   `container.createScope({ request })`. Until the promise settles, it renders
   `fallback`.
3. When the scope is ready, it renders its children with a context value whose resolver
   is the scope. `useService` then resolves scoped tokens from it, and singletons from the
   root through it (core §7.1).
4. When `createScope` rejects (`NEXUS_REQUEST_MISSING`, a `ProviderError` from a scoped
   factory), `ScopeProvider` throws the error in its next render, so the nearest error
   boundary shows it.
5. On unmount, the effect cleanup releases the scope through the deferred release of
   section 6.3, which disposes it.

`request` is read once, when the scope is created, like `useState`'s initial value. A
new `request` object on a later render does not make a new scope, because an inline
object literal would otherwise recreate the scope on every render. A component that
needs a new scope for new request data remounts the provider with a `key`:
`<ScopeProvider key={mission.id} request={{ mission }}>`.

### 6.2 Why an effect, and why client only

The scope is created in an effect, after commit, so every scope has a matching cleanup.
A scope created during render has none when React abandons that render (a suspended
sibling, a discarded transition, an error), and the scope and its scoped instances leak.

The server never runs effects, so a scope created during a server render has no point at
which it is disposed. Core 0.4 has no nested scopes, so it also cannot be a child of the
request scope that the React Router adapter disposes at stream end (integrations §7.3).
With nested scopes (section 18, K4), the server render could create a child of the request
scope, and the adapter's disposal of the parent would end it.

Decision (R6): `ScopeProvider` is client only in 0.4, with the effect-based lifecycle
above.

Consequences for users:

- A subtree under a `ScopeProvider` has no server HTML: the server sends `fallback`, and
  the client renders the subtree after hydration and after `createScope` settles. Keep
  scopes around interactive parts (a dialog, an editor, a wizard) and put content that
  must be server-rendered outside them.
- Scoped state lives exactly as long as the `ScopeProvider` is mounted.
- The first client render shows `fallback` for one commit even when `createScope` has no
  async factory to wait for, because `createScope` always returns a promise (core §7.2).
  With no scoped factories, that is one microtask plus one render.

Alternative, rejected: create the scope in render with `use()` and Suspense, keyed by
`useId()`. It gives server HTML, and it leaks a scope for every abandoned render and
every server render.

### 6.3 Deferred release and StrictMode

The store keeps one entry per acquirer (a `ScopeProvider` instance, or a `NexusProvider`
with `dispose`). `release` does not dispose at once: it schedules the disposal with
`setTimeout(0)`, and an `acquire` by the same acquirer before the timer fires cancels it.
StrictMode unmounts and remounts every effect synchronously in development, so the
re-acquire always cancels, and the scope keeps its identity through StrictMode. A real
unmount lets the timer fire.

A disposal error goes to `reportError` in the browser, and to `console.error` where
`reportError` does not exist.

React 19.2's `<Activity mode="hidden">` runs effect cleanups when it hides a subtree. A
`ScopeProvider` inside a hidden `Activity` disposes its scope, and shows `fallback`, then a
new scope, when the subtree is shown again. Hiding the subtree ends its scoped state. The
docs say so; an app that must keep it moves the `ScopeProvider` above the `Activity`.

### 6.4 Nesting

After hydration, a `ScopeProvider` whose context resolver is a scope (an outer
`ScopeProvider`, or a `NexusProvider` given `scope`) throws `NEXUS_REACT_NESTED_SCOPE` in
render. On the server and during hydration it renders `fallback` (section 6.1, step 1),
so a React Router server render, whose `NexusProvider` carries the request scope, never
throws it. The check runs in render, where its result is deterministic. Core 0.4 scopes
do not nest (core §3.6), and both silent options are wrong. Reusing the outer scope
shares scoped instances that two sibling dialogs expect to own. Creating a sibling scope
of the root hides the outer scope's instances from the inner subtree. K4 defers
`scope.createScope()` to 0.5, which core §3.6 says a later release can add without a
break.

### 6.5 Scopes and `load()`

A scope pins the blueprint current at its creation (core §7.1). After a `SectionBoundary`
loads a module, the store calls `await scope.extend()` on every live scope of its
provider, and on every scope whose `createScope` is still in flight once it settles,
before the boundary renders its children. So a component under any `ScopeProvider` can
read the section's tokens, and none throws `NEXUS_LOADED_AFTER_SCOPE`. `extend()` returns
at once for a scope that has nothing new to build (core §7.4). A client typically holds a
handful of scopes, so the cost is small.

A `load()` that app code runs outside the package does not extend the store's scopes.
The docs tell such code to call `extend()` on its own scopes, or to load through a
`SectionBoundary`.

## 7. Section boundaries

### 7.1 `lazySection` and `SectionBoundary`

```tsx
// shell/src/sections.ts
export const Cartography = lazySection('cartography', () =>
  import('@meridian/section-cartography').then((m) => m.Cartography)
);
```

```tsx
// shell/src/routes/charts.tsx
export default function ChartsRoute() {
  return (
    <SectionBoundary
      section={Cartography}
      fallback={<Loading />}
      errorFallback={SectionFailed}
      onError={(error) => telemetry.sectionFailed('cartography', error)}
    >
      <StarMap />
    </SectionBoundary>
  );
}

function StarMap() {
  const charts = useService(NAV_CHARTS); // INavCharts, exported by Cartography
  return <Chart plot={charts.plot('Kepler-442b')} />;
}
```

`lazySection(name, loader)` returns a handle with the name and the loader. It runs
nothing. It is a module-level constant, so its identity is stable across renders; an
inline loader passed straight to a component would be a new function on every render and
would load on every render.

`SectionBoundary`:

1. Renders `fallback` on the server and during hydration, as `ScopeProvider` does
   (section 6.2). Server-side lazy modules go through the React Router adapter's
   `di.load` in route middleware (integrations §3.9).
2. After hydration, reads the store's entry for `(container, section.name)`. The first
   reader starts `section.loader()`, then `container.load(module)`, then the scope
   extension of section 6.5, and stores the promise. Every later reader, and every
   remount, gets the same promise.
3. Calls `use(promise)` inside its own `<Suspense fallback={fallback}>`. The section's
   children render when the promise resolves.
4. Wraps that in its own error boundary for load failures (section 7.2).

`load()` of a module already in the graph does nothing (core §3.5), so two boundaries for
one section, or a boundary under a second provider on the same container, run one
compile. The cache is per container, so a container swap (section 12) loads every
section again into the new container.

Design note for 0.5: synthesis C19 plans `ship.mount(Section)` with an `AsyncDisposable`
handle. `SectionBoundary` can move from `load()` to `mount()` with no change to its
props, and `lazySection`'s name becomes the section's name.

### 7.2 Load failures

The boundary's error boundary catches what step 2 rejects with:

- The loader's rejection: a failed dynamic import, a remote that is down.
- `BlueprintError` (`NEXUS_BLUEPRINT_INVALID`) from `load()`: the section needs tokens the
  shell lacks, or collides with a shell export. Its `errors` array lists every problem at
  once (core §9). The container is unchanged (core §3.5).
- `ProviderError` from `load()`: a section singleton's constructor or factory failed.
  `load()` has disposed what it built (core §3.5).
- A `ProviderError` from a scope's `extend()`.

The boundary tells these apart from errors thrown by the section's own components with an
internal marker on the rejected promise. It rethrows a component error from its render,
so that error reaches the app's own error boundary above. The section boundary handles
the load, and the app handles its components' errors.

On a load failure it calls `onError(error)` once, clears the store entry, and renders
`errorFallback` with `{ error, retry }`. `retry()` re-renders the boundary, which starts
a fresh loader and `load()`. A retry helps with a failed import or a failed factory.
It repeats the same `BlueprintError` until the remote or the shell changes, and the
docs say so. Without `errorFallback`, the boundary rethrows the load error to the app's
error boundary.

Error text: core's `BlueprintError` message is one line with the code, the count and a
docs link, followed by each inner error's one-line message (core §9, D15). Registering
`errors()` or `devtools()` gives the full text. `errorFallback` components should branch
on `isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')` and read `error.errors[i].code`.
Both work across two copies of core in a federated page (core D21), where `instanceof`
fails.

### 7.3 What unmount means

Core has no unload in 0.4. Unmounting a `SectionBoundary` changes nothing in the
container:

- The module stays loaded. Its singletons stay alive, with their sockets, timers and
  subscriptions, until the container is disposed.
- Its exports stay visible to root `get()`.
- The store keeps the resolved promise, so a remount renders at once with no fallback.

Decision (R9): section singletons hold what the whole visit to the app needs (an API
client, a cache). Anything that should end when the user leaves the section (a live
socket, a polling timer, a draft) is `scoped` and lives under a `ScopeProvider` inside
the boundary, so unmounting the boundary disposes it (section 6). The docs' sections page
shows this, and states plainly that `load()` has no unload in 0.4.

```tsx
<SectionBoundary section={Cartography} fallback={<Loading />}>
  <ScopeProvider fallback={<Loading />}>
    <LiveTelemetry /> {/* TELEMETRY_STREAM is scoped: closed on unmount */}
  </ScopeProvider>
</SectionBoundary>
```

Consequences for users: a single-spa `unmount` or a route change leaves the section's
singletons running for the life of the tab. A team that needs a section singleton torn
down on navigation cannot do it in 0.4. Unload arrives with C19 in 0.5 (section 18, K5).

## 8. Suspense for async startup

`Nexus.create` is async: it awaits async factories and `onInit` level by level (core
§8.1). The provider takes the promise, so an SPA shows a fallback while the container
starts and an error boundary when it fails:

```tsx
// src/ship.ts
export const shipReady = Nexus.create(Meridian, {
  plugins: import.meta.env.DEV ? [devtools(), react()] : [],
});

// src/app.tsx
export function App() {
  return (
    <StartupErrorBoundary>
      <Suspense fallback={<PoweringUp />}>
        <NexusProvider container={shipReady}>
          <Bridge />
        </NexusProvider>
      </Suspense>
    </StartupErrorBoundary>
  );
}
```

- `use(shipReady)` suspends the provider. Everything under it waits, and nothing under it
  calls `get()` before `create` has finished.
- A rejection reaches `StartupErrorBoundary`. A wiring error is one `BlueprintError`
  listing every problem, thrown before any constructor runs (core D7).
- The promise is created once, at module level. The docs show the warning React prints
  for a promise created in render, and why.

For an SSR app, the client entry awaits the container before `hydrateRoot`:

```tsx
// app/entry.client.tsx (React Router 8)
const ship = await shipReady;
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <NexusProvider container={ship}>
        <HydratedRouter />
      </NexusProvider>
    </StrictMode>
  );
});
```

Decision: `await` before `hydrateRoot` in SSR apps, and the promise form with
Suspense in SPAs.

Consequences for users: hydration starts after `create` in both forms, so the page stays
non-interactive for the `create` time: 0.5 to 4 ms for 20 to 200 services on a desktop,
5 to 10 times that on a mid-range phone (frontend §2). `eager: false` on singletons that
render does not need shortens it (core D11). The awaited form needs no `<Suspense>` at the
document root, which React Router's root route does not have, and gives the same delay.

## 9. SSR and hydration

Services are not serializable. React Router passes loader data, and Next passes server
component props. Both carry values only. An SSR app that uses services on both sides
therefore has two graphs: a server graph and a client graph, compiled and built
separately, sharing only the contracts file.

### 9.1 React Router 8

```text
app/
  bridge/contracts.ts        tokens and interfaces; imported by both sides
  bridge/bridge.server.ts    the server graph: STAR_CATALOG -> SqlStarCatalog
  bridge/bridge.client.ts    the client graph: STAR_CATALOG -> HttpStarCatalog
  nexus.server.ts            Nexus.create(BridgeServer) and nexus(ship) (integrations §7.2)
  ship.client.ts             export const shipReady = Nexus.create(BridgeClient)
  entry.server.tsx           NexusProvider with the request scope
  entry.client.tsx           NexusProvider with the client container (section 8)
```

The server render runs components too, and a component that calls `useService` needs a
container there. The React Router adapter already creates a request scope and disposes
it when the body stream ends (integrations §7.3). The server entry hands that scope to
the provider:

```tsx
// app/entry.server.tsx
import { NEXUS_SCOPE } from '@nexusdi/react-router';
import { ship } from './nexus.server';

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider
) {
  const scope = await loadContext.get(NEXUS_SCOPE).scope();
  const body = await renderToReadableStream(
    <NexusProvider container={ship} scope={scope}>
      <ServerRouter context={routerContext} url={request.url} />
    </NexusProvider>,
    { signal: request.signal }
  );
  // ...headers and isbot handling as in React Router's default entry
  return new Response(body, { status, headers });
}
```

Rules for users, which the React Router guide states:

- Every token a component resolves in render is bound in both graphs. On the server the
  binding may be a thin implementation (`SqlStarCatalog` reads the database; a server
  `ANALYTICS` does nothing). This is the interface-first payoff: the component names
  `STAR_CATALOG`, and each side binds its own class.
- What a component renders comes from loader data, or from a service call that returns
  the same value on both sides. A service that returns a different value on the server
  than in the browser causes a hydration mismatch. Services in render are for handlers
  and effects; data comes from loaders.
- `Nexus.check(BridgeServer)` and `Nexus.check(BridgeClient)` run in one CI test, so an error in either
  graph fails the CI pipeline before any page loads.
- A value the server computed (feature flags, tenant config) reaches the client as loader
  data, and the client graph binds it with `useValue` or `forRoot`. A client service that
  needs it before hydration reads it from a JSON `<script>` the root route renders.
  NexusDI has no transfer-state mechanism, and every framework already has a payload
  channel (frontend §3.3).
- A token that a component reads in render outside a `ScopeProvider` binds to a
  singleton or a value provider in the client graph (an alias counts as its target). It
  may be `scoped` in the server graph. The client root has no scope, so root `get()` of a
  scoped token throws `NEXUS_SCOPE_REQUIRED` during hydration (core §3.5).
- `clientLoader` and `clientMiddleware` run outside React. They import `shipReady` from
  `ship.client.ts` and `await` it. `@nexusdi/react-router` stays server only
  (integrations §7.2).

To verify in the e2e test (section 16): the React Router 8 `handleRequest` signature
passes the middleware `RouterContextProvider` as `loadContext`, so the entry can read
`NEXUS_SCOPE`. If it does not, the adapter needs a way to expose the scope to the
entry, and the integrations spec takes the item.

Decision (R11): SSR with the request scope as above, with the lifetime rule for tokens
read in render.

Consequences for users: a React Router app keeps server HTML for every component that
uses `useService`, except under `ScopeProvider` and `SectionBoundary` (sections 6.2 and
7.1). The app maintains two module graphs, which it needs anyway, because the server
graph holds database pools and the client graph holds fetch clients.

### 9.2 Next.js App Router

Next renders client components on the server as well. A client container created at
module level in `app/providers.tsx` would be one object per server process, shared by
every request's server render, so one user's state could reach another user's HTML. A
client component has no per-request hook on the server (`cache()` is for server
components). So the client container exists only in the browser:

```tsx
// app/providers.tsx
'use client';
import { NexusProvider } from '@nexusdi/react';
import { shipReady } from './ship.client';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NexusProvider
      container={shipReady}
      clientOnly
      dispose
      fallback={<ConsoleSkeleton />}
    >
      {children}
    </NexusProvider>
  );
}
```

```ts
// app/ship.client.ts
export const shipReady =
  typeof window === 'undefined' ? null : Nexus.create(BridgeClient);
```

`clientOnly` makes the provider render `fallback` on the server and during hydration,
through the same `useSyncExternalStore` flag as section 6.2, and then the container.
Without it, the client's hydration render would differ from the server HTML.

Decision (R12): `clientOnly` for Next. Place the provider around the interactive parts
that use services, so the rest of the page keeps its server HTML.

Consequences for users: components under a `clientOnly` provider have no server HTML. A
Next page that needs server HTML for a component gets its data in a server component and
passes it as props; the service code on the server side uses the recipe of section 10.

### 9.3 What crosses the boundary

| Thing                                  | Crosses      | How                                                                              |
| -------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| Interfaces and tokens (`contracts.ts`) | yes, as code | both bundles import the same file; it imports no implementation                  |
| Module definitions                     | no           | one file per side (`*.server.ts`, `*.client.ts`)                                 |
| Containers, scopes, service instances  | never        | each side builds its own                                                         |
| Data a service produced                | yes, as data | loader data, server component props, a JSON `<script>`                           |
| `REQUEST`                              | no           | server only; the client passes its own through `ScopeProvider`                   |
| Errors                                 | codes only   | the React Router adapter maps a `NexusError` to a `Response` (integrations §7.4) |

Token identity: each side has its own copy of `contracts.ts`, and each container sees
only its own side's tokens, so the two copies never meet. Within one side, identity
breaks in three places: a Next server that evaluates a module twice (frontend §3.2, W3,
unverified on Next 16), a federated remote that bundles its own contracts (core C7,
solved by `@nexusdi/federation`), and HMR (section 12).

## 10. React Server Components

| Case                                                      | Works    | How, or why not                                                             |
| --------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `useService` in a server component                        | no       | server components have no hooks and no context                              |
| A server component renders `<NexusProvider>`              | no       | a container is not serializable, so it cannot be a prop across the boundary |
| A client component under `<NexusProvider>`                | yes      | sections 4 to 9                                                             |
| A server component reads services                         | yes      | the `cache()` plus `after()` recipe (frontend §3.2), without this package   |
| A server action                                           | yes      | `createScope` and `await using` in the action, without this package         |
| A `"use cache"` function                                  | no       | it cannot read request data, and its arguments must be serializable         |
| A service instance passed as a prop to a client component | no       | props must be serializable                                                  |
| React Router's RSC mode                                   | untested | not covered by 0.4; the React Router guide says so                          |

The entry starts with `'use client'`. Every export is then a client reference when a
server component imports it: rendering `<NexusProvider>` from a server component fails
on its non-serializable prop, and calling `useService` there fails as any client hook
does. Without the directive, the import itself fails in the RSC bundle on
`createContext`, with a message that does not name NexusDI. TanStack Query and React
Redux publish the directive the same way.

The server recipe stays a docs page, as synthesis decided (no `@nexusdi/next`, C13). Its
page waits for the Next 16 token identity reproduction.

## 11. StrictMode

StrictMode in development renders every component twice and runs every effect twice.
The package uses no ref callbacks. Each part of the package:

| Part                              | Double render                         | Double effect                                                |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `useService`, singleton or scoped | same instance both times              | no effect                                                    |
| `useService`, transient           | would build two; `react()` rejects it | no effect                                                    |
| `NexusProvider` with a promise    | `use()` reads the same promise        | no effect                                                    |
| `NexusProvider` with `dispose`    | no side effect in render              | deferred release cancels the simulated unmount (section 6.3) |
| `ScopeProvider`                   | no side effect in render              | same: one scope, with one identity                           |
| `SectionBoundary`                 | the store returns the same promise    | no effect; `load()` runs once per container and section name |

A test in section 16 renders every component under `<StrictMode>` and asserts one
`scope:create` event per `ScopeProvider` and one `compile` event with `phase: 'load'` per
section, counted through `trace(fn)` from `@nexusdi/devtools`.

## 12. HMR

The rule for every toolchain: a service edit produces a new container, the provider
swaps to it, and the provider disposes the old one after nothing renders it. Components
never hold a disposed container, so `NEXUS_DISPOSED` after an update (frontend §3.4) does
not happen.

### 12.1 Vite

```tsx
// src/main.tsx (SPA) or app/entry.client.tsx (React Router 8, with hydrateRoot)
import { shipReady } from './ship';

const app = (ship: Nexus) => (
  <StrictMode>
    <NexusProvider container={ship} dispose>
      <App />
    </NexusProvider>
  </StrictMode>
);

const root = createRoot(document.getElementById('root')!);
root.render(app(await shipReady));

import.meta.hot?.accept('./ship', async (next) => {
  if (next) root.render(app(await next.shipReady));
});
```

An edit to a service class propagates through its module file to `ship.ts`. The entry
accepts `ship.ts`, so Vite re-evaluates `ship.ts`, which creates a new container, and
calls the callback. `root.render` gives the provider the new container, the provider
commits it, and the deferred release disposes the old one (section 6.3). Every
`ScopeProvider` makes a new scope, and every `SectionBoundary` loads its section into the
new container.

An app whose provider sits in a component file (`app.tsx` exports only components, and
imports `shipReady`) gets the same swap from Fast Refresh with no `accept` call: the
component file is the refresh boundary, it re-evaluates with the new `shipReady`, and
the provider receives a new promise. The docs show the explicit form, because it also
works when the provider sits in an entry file.

Consequences for users:

- Singleton state resets on every service edit, because the container is new. Component
  state stays where Fast Refresh keeps it.
- With a promise, the Suspense fallback shows for the `create` time on each edit.
- Without `dispose`, each edit leaks a container. The docs recipe sets it.

### 12.2 Tokens under HMR

An edit to `contracts.ts` evaluates it again and creates new `Token` objects (frontend
§3.4). Every importer re-evaluates up to a boundary: the module files and `ship.ts`
(a new container built with the new tokens), and the component files (hooks called with
the new tokens). After the swap both sides hold the new tokens.

To verify in the HMR e2e test (section 16): a section loaded before the edit, whose
module also imports `contracts.ts`, is imported again with the new tokens when the
boundary loads it into the new container. If the test shows the old module instance,
the docs add a full-reload line to contracts files, and section 17 records the change.

### 12.3 Section modules

An edit to a section's module file creates a new module object with the same exports.
A `load()` of it into the container that already holds the old copy fails with
`NEXUS_AMBIGUOUS_PROVIDER` (multi-team §4), and core has no unload to remove the old copy
(K5).

The store keeps, per container, the module object each section name loaded. When a
`LazySection` object it has not seen arrives with a known name, the store runs its
loader. The same module object means only the file holding `lazySection` changed, and
nothing happens. A different module object has three cases:

- A module with a different `name` from the module that section name loaded: two sections
  share one section name. The boundary fails with `NEXUS_REACT_SECTION_CONFLICT`, in
  development and in production.
- The same module `name`, in production: two builds of one section in one page. The
  boundary fails with `NEXUS_REACT_SECTION_CONFLICT`.
- The same module `name`, in development: the package reads the sessionStorage key
  `nexusdi:section-reload`. When it holds this section name with a time less than 10
  seconds old, the reload did not remove the conflict, which means two copies of the
  section are in the page. The package removes the key and the boundary fails with
  `NEXUS_REACT_SECTION_CONFLICT`. Otherwise the package writes
  `{ section, at: Date.now() }` to the key, logs a `console.info` naming the section, and
  calls `location.reload()`. Every storage read and write runs in try/catch. When storage
  throws, the boundary fails with the conflict error and the page does not reload.

A full reload is the only correct result while the old module's singletons cannot be
removed, and any automatic reload needs a loop breaker. Two copies of one section share a
module name, so a rule on the name alone would reload on every page load. The guard is a
few lines of development-only code, which production builds strip.

Decision (R10): the guarded full reload in development. The alternative, a new
container for the whole app on every section edit, would need the provider to own
`Nexus.create`, which section 3.1 keeps in app code.

Consequences for users: an edit to a section's module file reloads the page in
development. Edits to the section's components still use Fast Refresh, since they do not
change the module object. A second edit of the same section module within 10 seconds of
the reload shows the conflict error once, and the next edit reloads again. A copy-pasted
section name gives a named error in every build. K5 (unload) turns the reload into a
swap in 0.5.

### 12.4 Next.js

- Client: Fast Refresh evaluates `ship.client.ts` again and then `providers.tsx`, which
  is a refresh boundary, and the provider swaps as in section 12.1. `providers.tsx` sets
  `dispose`.
- Server: the recipe keeps one server container on `globalThis`, so an edited server
  service takes effect after a restart (frontend §3.4). That is the server recipe's
  trade-off, outside this package.

### 12.5 React Native

Metro's Fast Refresh follows the same boundary rules as Vite, so section 12.1's
component-file form applies. React Native is not tested in 0.4, and the docs list it as
untested.

## 13. Testing

A component test builds a testing container with overrides, and wraps the component in
the provider. React Testing Library's `wrapper` option takes it in one line, so the
package exports no test helper.

```tsx
// src/star-list.test.tsx
import { createTestingContainer } from '@nexusdi/testing';
import { NexusProvider, react } from '@nexusdi/react';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, test } from 'vitest';
import { STAR_CATALOG } from './bridge/contracts';
import { Bridge } from './bridge/bridge.module';

test('lists the five nearest stars', async () => {
  await using ship = await createTestingContainer(Bridge)
    .override(STAR_CATALOG, { useValue: fakeCatalog(sol, proxima, barnard, wolf, lalande) })
    .create({ plugins: [react()] });

  const view = render(<StarList />, {
    wrapper: ({ children }) => (
      <StrictMode>
        <NexusProvider container={ship}>{children}</NexusProvider>
      </StrictMode>
    ),
  });

  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  view.unmount(); // before `await using` disposes the container
});
```

Rules the testing page states:

- Unmount before the container is disposed. `await using` disposes at the end of the test
  body, and React Testing Library's automatic cleanup unmounts in `afterEach`, which runs
  later. A component whose effect cleanup calls a service would call it on a disposed
  container.
- Register `react()` in tests, so a transient in render fails the test.
- Wrap in `<StrictMode>`, so the test runs the double render and double effect the app
  runs in development.
- A `ScopeProvider` creates its scope after mount, so a test of a scoped component
  awaits it: `await screen.findByRole(...)`.
- A section test replaces the section's module with
  `overrideModule(Cartography, CartographyStub, { lazy: true })`, so the boundary's
  `load()` walks the stub (core §11). A component that passes `{ module: Cartography }`
  resolves in the stub (core §3.5, K6). A load failure test gives the boundary a
  `lazySection` whose loader rejects.
- A hook test uses `renderHook(() => useService(FLIGHT_LOG), { wrapper })` with a
  `ScopeProvider` in the wrapper.
- `@nexusdi/vitest`'s fixtures (integrations §8) provide the container and a scope.
  Whether fixture teardown runs before or after React Testing Library's cleanup is not
  specified there, so the testing page keeps the explicit `unmount()` until a test pins
  the order.

## 14. Errors

The package declares four codes as bodyless `NexusError` subclasses built with core's
public `errorBase` (as `@nexusdi/decorators` does for `NEXUS_LEGACY_DECORATORS`), added to
`NexusErrorByCode` by augmentation (core §9). `isNexusError(error, code)` recognises them.

| Code                              | Thrown by                                                                                                          | Fields                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `NEXUS_REACT_NO_PROVIDER`         | `useService`, `useContainer`, `ScopeProvider`, `SectionBoundary` outside a provider                                | `hook: string`                      |
| `NEXUS_REACT_TRANSIENT_IN_RENDER` | `useService` with `react()` registered                                                                             | `token: string`, `provider: string` |
| `NEXUS_REACT_NESTED_SCOPE`        | `ScopeProvider` under a scope, after hydration                                                                     | none                                |
| `NEXUS_REACT_SECTION_CONFLICT`    | `SectionBoundary`: a different module name, a production duplicate, or a development conflict right after a reload | `section: string`                   |

The message is core's one line with the code, the fields and the link
`https://nexus.js.org/errors/<CODE>`. The docs site has a page per code with the fix.
`errors()` cannot add text to them: its `formatError` hook runs for errors core raises
in a container operation (core §3.10.6), and these are raised by the package in render.

## 15. Bundle cost

Estimates from the source sketch in this spec, gzip, D12's method. The size report
(core §12.4) measures the package on every pull request once it exists.

| Part                                                                  | Est. gzip     |
| --------------------------------------------------------------------- | ------------- |
| `NexusProvider`, the context, the store, `useService`, `useContainer` | 0.5 to 0.7 KB |
| `ScopeProvider` and the deferred release                              | 0.2 to 0.3 KB |
| `lazySection`, `SectionBoundary` and its error boundary class         | 0.4 to 0.5 KB |
| The four error subclasses                                             | under 0.1 KB  |
| `react()`, development and tests only                                 | 0.1 to 0.2 KB |

- An app that imports `NexusProvider` and `useService` bundles est. 0.5 to 0.7 KB. Every
  component is a separate export with `"sideEffects": false`, so a bundler drops what the
  app does not import.
- All of it: est. 1.2 to 1.6 KB, plus core's est. 13.5 to 14.5 KB before the
  consolidation workstream (core D5). A React app that adopts NexusDI adds est. 14 to 16
  KB of JavaScript that parses before hydration.
- The package imports only `react` and `@nexusdi/core`, and has no dependencies.

Consequences for users: for a single-team SPA, React context adds 0 KB, and the frontend
wargame rates NexusDI negative value there (frontend §1). The docs' "when you do not need
a container" section (core D6) says so on the React page too. The package is for apps
that need what core adds: async startup in dependency order, validated lazy sections, and
one override path for tests. The comparison page lists `inversify-react` and
`react-tsyringe`, which also need legacy decorators, with sizes the
size report measures in the same fixture before the page states any figure.

## 16. Package, peers and tests

```json
{
  "name": "@nexusdi/react",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "react": "^19.0.0" },
  "engines": { "node": ">=22.12" }
}
```

- `react` 19.0 is the floor: `use()` and context-as-provider arrived in 19.0. `react-dom`
  is not a peer: the package uses no DOM API, which keeps React Native possible.
- The exact core peer follows core D9; the release rule of integrations §10 applies.
- `'use client'` stays the first line of `dist/index.js`. `verify-packaging` checks it,
  because some bundlers strip directives.
- Development-only behaviour (the section reload of section 12.3) checks
  `process.env.NODE_ENV !== 'production'`, which every React toolchain already replaces,
  because React itself reads it.

Tests:

- Unit (Vitest, React Testing Library, jsdom): every component under `<StrictMode>`;
  the deferred release (StrictMode keeps one scope, a real unmount disposes it); the
  nesting error; the section cache (two boundaries, one `load()`); retry after a
  rejected loader; a component error inside a boundary reaching the outer boundary; the
  `MultiToken` memo (same array while contents match, a new array after an app-driven
  `load()`, separate arrays per scope); `scope.extend()` of every live scope after a
  load; `dispose` on swap and on unmount; the transient check with `react()`, through an
  alias and a `MultiToken`; `react()` with `{ module }` under `overrideModule`; the
  section reload guard (a mocked `location.reload` and sessionStorage, including storage
  that throws).
- Type tests: `useService` overloads, `readonly T[]` for a `MultiToken`, `LookupOptions`.
- SSR: `renderToReadableStream` with the `scope` prop; `hydrateRoot` on that HTML with no
  hydration warning for `ScopeProvider`, `SectionBoundary` and `clientOnly`; a
  `ScopeProvider` under a `NexusProvider` with `scope` renders its fallback and throws
  nothing.
- React Router 8 e2e: a fixture app whose `entry.server.tsx` reads `NEXUS_SCOPE` from
  `loadContext` (the item of section 9.1), rendering a component that reads a token bound
  `scoped` in the server graph and `singleton` in the client graph, then hydrating with
  no `NEXUS_SCOPE_REQUIRED` and no hydration warning.
- Next 16 e2e: a fixture with `providers.tsx`, asserting that no client container is
  created in the server process and that a server component importing `useService`
  fails with Next's client-reference error.
- HMR e2e (Vite dev server, Playwright): a service edit swaps the container and disposes
  the old one with no `NEXUS_DISPOSED`; a contracts edit (section 12.2); a section module
  edit reloads the page.
- Peers: the unit and SSR suites run on `react` 19.0 and the latest 19.x.

## 17. Resolved decisions

The owner delegated R1 to R16 to an architect and a tech lead on 2026-09-28. The
architect proposed a ruling for each item, and the tech lead checked each against the
pillars, users (0.3 users included), migration cost, bundle size and DX, and gave the
final ruling below. The body of this spec already reflects every ruling. None removes or
renames core API. Every name below is new API of `@nexusdi/react`, and 0.3 had no React
package, so no 0.3 user migrates anything for this package.

Five rulings amend the draft recommendation: R4, R5, R7, R10 and R16. R11 keeps its
recommendation and adds a rule.

R1. React 19 only.

- Ruling: `react` `^19.0.0`. Accepted as recommended.
- Reason: the provider's promise form needs `use()`, which React 18 lacks (sections 3.1
  and 8). P1.
- Users: a React 18 app keeps its own glue until it upgrades.

R2. The app creates the container, and the provider only publishes it.

- Ruling: `NexusProvider` takes `Nexus | Promise<Nexus> | null` and never calls
  `Nexus.create` (section 3.1). Accepted as recommended.
- Reason: `Nexus.create` looks the same in a server, a test and a browser, and the
  provider stays small. P2, P5, P6.
- Users: one module-level line for the promise. The provider cannot rebuild the
  container, which is why a section module edit reloads the page (R10).

R3. The provider disposes only with `dispose`.

- Ruling: default `false`; `dispose` for the HMR recipe and for containers that live
  exactly as long as the React root. Accepted as recommended.
- Reason: the code that called `create` owns disposal, as core §8.2 and `await using`
  already say. P5.
- Users: tests and servers keep ownership. The HMR recipe sets `dispose`, or it leaks
  one container per edit in development.

R4. The transient check lives in the optional `react()` plugin.

- Ruling (amended): register `react()` in development and tests (section 4.2). It is
  released in rc.0 and needs K1, K2 and K3 in core, which section 18 puts in core 0.4.
  R16 gives the rule if one of them is late. For `{ module: ref }`, `react()` resolves
  `ref` with core's `moduleDefinitionOf` and checks the module whose `definition` or
  `replaced` is that definition, which is the module core's `get()` selects after K6.
  When the view has no provider for the token, the check does nothing and `get()` throws
  its own error. A unit test covers `overrideModule` together with `{ module }`.
- Reason: core builds views only for a plugin that asks for them, so the check costs
  nothing in production (P6) and adds one line beside `devtools()` (P2). The draft
  compared `definition === ref`, which misses every `@Module` class, because a class is a
  different object from its definition.
- Users: in development and tests, a transient read in render fails on the first render
  with the fix in the message. Without `react()`, nothing warns. `devtools()` does not
  include `react()`.

R5. `useService` memoizes `MultiToken` arrays.

- Ruling (amended): a shallow-compare memo per resolver, token and module, as section
  4.3 states. The draft's cache, cleared on package-driven loads, is dropped, and R5 no
  longer depends on K2.
- Reason: the draft cache went stale after an app-driven `load()`, and K2 could not fix
  that in production, because without a registered plugin the package never sees a
  blueprint. It also keyed only by token and module, so two `ScopeProvider`s would share
  one array of scoped contributions, and it would have kept one transient instance
  forever. The memo costs one `get()` plus an O(n) compare of a small array per render.
  P5.
- Users: arrays are stable across renders while their contents are, and reflect every
  `load()` on the next render. A transient contribution gives a new array each render,
  and `react()` rejects that token in development.

R6. `ScopeProvider` is client only, created in an effect, with `request` read once.

- Ruling: as section 6. Accepted as recommended.
- Reason: a scope created in render leaks on every abandoned render and every server
  render, and core 0.4 has no parent scope to hang a server scope on (core §3.6, K4). P5,
  P8.
- Users: no server HTML under a `ScopeProvider`. A new request needs a `key`. A hidden
  `<Activity>` disposes the scope. The docs state all three.

R7. A nested `ScopeProvider` throws after hydration.

- Ruling (amended): `NEXUS_REACT_NESTED_SCOPE` after hydration only, until core has
  nested scopes (K4). On the server and during hydration a `ScopeProvider` renders
  `fallback`, also under a `NexusProvider` given `scope` (section 6.4). A unit test
  renders that case through `renderToReadableStream`.
- Reason: the draft threw in render under any `NexusProvider` given `scope`. Section 9.1
  passes `scope` on every React Router server render, so every `ScopeProvider` in a React
  Router app would have crashed the server render, against section 6.1 step 1.
- Users: React Router apps can use `ScopeProvider`. A true nesting on the client throws
  until 0.5. A dialog inside a scoped page shares the page's scope, or its
  `ScopeProvider` moves out of the page's.

R8. `SectionBoundary` owns load failures only, and renders on the client.

- Ruling: as section 7. `lazySection` takes a name, which the cache, the HMR check and
  the 0.5 `mount()` use. Accepted as recommended.
- Reason: one validated `load()` per container and section name, and one
  `BlueprintError` that lists every problem (core §3.5, §9). P3, P5.
- Users: one component gives a lazy section a fallback and an error fallback. A
  component error inside a section still reaches the app's own error boundary. A
  section's UI has no server HTML.

R9. Unmounting a section leaves its module loaded.

- Ruling: document it and steer per-visit resources into a `ScopeProvider` inside the
  boundary (section 7.3). Accepted as recommended.
- Reason: core 0.4 has no unload (K5). P3.
- Users: section singletons live until the tab closes. Scoped resources end on unmount.

R10. A section module edit reloads the page once in development.

- Ruling (amended): the guarded reload of section 12.3. A different module name fails
  with `NEXUS_REACT_SECTION_CONFLICT` in every build. The same name reloads in
  development, guarded by the sessionStorage key `nexusdi:section-reload` with a
  10-second window, and fails with the conflict error in production.
- Reason: the draft reloaded on every conflict in development, so two `lazySection`
  handles with one name, or two copies of one section, reloaded the page forever. The
  architect's guard, cleared after the next successful load, still looped on two copies.
  The time window breaks the loop, and production builds strip the code. P5.
- Users: an edit to a section module reloads the page once. A second edit of that module
  within 10 seconds of the reload shows the conflict error once. A copy-pasted section
  name gives a named error, where the draft gave an endless reload.

R11. React Router 8 SSR renders with the adapter's request scope.

- Ruling (recommendation kept, rule added): `entry.server.tsx` passes `scope` to
  `NexusProvider` (section 9.1). The React Router guide adds the rule that a token read
  in render outside a `ScopeProvider` binds to a singleton or a value in the client
  graph, and may be `scoped` in the server graph. The e2e test hydrates and asserts no
  `NEXUS_SCOPE_REQUIRED` and no hydration warning. The `loadContext` question stays with
  the integrations spec.
- Reason: the server resolves through the request scope, and the client root throws
  `NEXUS_SCOPE_REQUIRED` for scoped tokens (core §3.5), so a component valid on the
  server could crash at hydration. The draft e2e test would have hit exactly that. P5,
  P3.
- Users: server HTML for components that use services, two graphs, and one CI
  `Nexus.check` over both. The rule tells them which lifetime each side's binding may
  have.

R12. Next.js uses a `clientOnly` provider, and the RSC side stays a recipe.

- Ruling: as sections 9.2 and 10, with no `@nexusdi/next`. The section 9.2 example sets
  `dispose`, matching section 12.4. Accepted as recommended.
- Reason: a module-level client container on the Next server is shared across requests,
  which leaks one user's state into another user's HTML. P2, P6.
- Users: no server HTML under the provider in Next. Server components use the
  `cache()` plus `after()` recipe, whose page waits on the token identity reproduction.

R13. The entry starts with `'use client'`.

- Ruling: yes (section 10). Accepted as recommended.
- Reason: a misuse in a server component gets Next's client-reference error, which names
  the component. Without the directive the import fails on `createContext`. P5.
- Users: a clearer error and nothing else.

R14. No test helper export.

- Ruling: React Testing Library's `wrapper` with `NexusProvider` (section 13). Accepted
  as recommended.
- Reason: the `wrapper` is one line, so a helper would add API and save none. P2, P6.
- Users: one wrapper per test file or a shared one in setup, plus an explicit
  `unmount()` before `await using` disposes.

R15. Package errors carry core's one-line message and a docs page per code.

- Ruling: as section 14. The four classes use core's public `errorBase`, as
  `@nexusdi/decorators` does. Accepted as recommended.
- Reason: this matches core D15 and D21, and `formatError` cannot reach errors raised in
  render (core §3.10.6). P6.
- Users: `isNexusError(e, 'NEXUS_REACT_…')` works across two copies of core, and the fix
  is on the linked page.

R16. Everything in this spec targets rc.0.

- Ruling (amended): rc.0 for the whole package. `react()` needs K1, K2 and K3. If one of
  them is not in core by rc.0, `react()` is released in the first RC that has all three,
  and the rest of the package in rc.0. K6 gates no export. Until K6 is in core, the
  testing page leaves out the `overrideModule` rule for components that pass
  `{ module }`.
- Reason: core D18 puts React at launch with the other adapters. The draft exception
  named K1 only, and the check needs all three items. `react()` never calls `get()` with
  a replaced module, so K6 does not hold the plugin back. P5.
- Users: the RC feedback on the flagship multi-team case covers the whole package from
  the first RC.

## 18. Core items

This spec invents no core API. Each item is a gap it found in core spec revision 2. The
architect and the tech lead ruled on each on 2026-09-28. K1, K2, K3 and K6 go into core
0.4 before rc.0, with the text below, which the core controller pastes verbatim. K4 and
K5 are deferred to 0.5 and change no core text.

K1. `BlueprintView.root`. In core 0.4.

- Need: the transient check calls `visible(root, token)` (section 4.2). Core §5 assigns
  module ids in walk order, so the root is `m0` in practice, but the spec states neither
  the root's id nor the order of `modules`, and `PluginContext` has no root.
- Ruling: add the field. A string id matches `visible(moduleId)`, `ModuleView.id` and
  `ProviderView.module`. A new field on a view does not raise `NEXUS_PLUGIN_API` (core
  §3.10.2). The internal `Blueprint.root` already exists on `feat/core-0.4`, so the view
  copies one string.
- Core §3.10.1, `interface BlueprintView`, after the `complete` field:

  ```ts
    /** The root module's id. Root get(), has(), resolve(), validate() and every scope look tokens up in this module. */
    readonly root: string;
  ```

- Core §3.10.1, a new paragraph after the views code block, before "Core builds the views
  only when...": "`root` is the id of the root module, the module whose visibility root
  `get()`, `has()`, `resolve()`, `validate()` and every scope use (sections 3.5 and 7.1).
  `load()` adds imports to the root and never replaces it, so every view of one container
  carries the same `root`. In a `Nexus.check` view, `root` is the checked root.
  `visible(view.root, token)` returns the providers a root lookup of `token` considers, in
  lookup order."
- Controller: add `root` to `ViewParts`, and set it in `viewOfBlueprint`, the
  compile-time check view and `failedView`. Test that a `compile.check` hook on a failed
  compile reads it.
- Blocks: R4.

K2. Identity and cost of `context.blueprint()`. In core 0.4.

- Need: `react()` caches lifetimes per blueprint and must know when a `load()` changed
  the graph.
- Ruling: state the guarantee. The core plan already caches one view per frozen
  `Blueprint` in a `WeakMap`, and core §5 publishes one frozen `Blueprint` per successful
  `load()`, so the guarantee costs nothing extra.
- Core §3.10.1, `interface PluginContext`, replace the doc comment on `blueprint()`:

  ```ts
    /** The current blueprint's view: one frozen object per published blueprint. A load() that changes the graph publishes a new one. */
    blueprint(): BlueprintView;
  ```

- Core §3.10.5, the `setup` bullet, replace the whole sentence "`context.container` is the
  finished container, and `context.blueprint()` returns the current view, which a later
  `load()` replaces." with: "`context.container` is the finished container.
  `context.blueprint()` returns the view of the current blueprint. It returns the same
  frozen object on every call until a `load()` publishes a new blueprint, so a plugin can
  key a cache on the view's identity. Core builds that view on the first call after a
  publish, at most once per blueprint. A `load()` that does nothing, and a `load()` that
  fails, publish no blueprint, and the view stays the same object."
- Blocks: R4.

K3. `visible()` and `tokenKey`. In core 0.4.

- Need: a contract token from `@nexusdi/federation` must resolve its lifetime through
  the key `get()` uses. The core plan (Task R25) keys lookups through `state.canon`, while
  `buildView.visible` still indexes the raw token, so with `federation()` registered the
  view misses a contract token from a second copy of the contracts package.
- Ruling: state it and fix the view.
- Core §3.10.1, `interface BlueprintView`, replace the `visible` doc comment:

  ```ts
    /** Provider ids of `token` visible in the module, in lookup order. The token is keyed through the tokenKey hooks, as get() keys it. */
    visible(moduleId: string, token: AnyToken): readonly string[];
  ```

- Core §3.10.3, append to the paragraph that starts "`tokenKey(token)` maps a token to the
  key every lookup uses": "`BlueprintView.visible()` keys its `token` argument the same
  way, so a plugin that asks about a token from a second copy of a contracts package gets
  the providers that `get()` of that token would consider."
- Controller: `buildView` takes the container's canonicalizer (`RootState.canon`, or
  `Nexus.check`'s own) and applies it in `visible`.
- Blocks: R4.

K4. Nested scopes. Deferred to 0.5.

- Need: a `ScopeProvider` inside a scope (section 6.4), and a server-rendered
  `ScopeProvider` as a child of the React Router request scope (section 6.2).
- Ruling: `scope.createScope()` in 0.5, in the sections spec that synthesis decision 8
  plans, with the rule "a child scope ends when its parent ends". That spec also decides
  which scope owns a scoped instance, and whether an inner scope sees the outer
  `REQUEST`. No core text changes now: core §3.6 already says `scope.createScope()` can be
  added without a break.
- Users: a scoped dialog inside a scoped page throws on the client (R7). In a React
  Router app, server HTML stops at the first `ScopeProvider`.

K5. Unload. Deferred to 0.5.

- Need: a section's singletons end on unmount (section 7.3), and a section module edit
  swaps in place (section 12.3).
- Ruling: as synthesis C19, `mount()` returning an `AsyncDisposable`, in 0.5. Unload has
  to undo `load()`'s additive guarantees (core §3.5, §7.4), which needs its own design.
  No core text changes now. `SectionBoundary` moves to `mount()` with no change to its
  props.
- Users: section singletons live for the whole tab, and a section module edit reloads
  the page in development (R10).

K6. `{ module: Mod }` after `overrideModule(Mod, Stub)`. In core 0.4.

- Need: the section tests of section 13. On `feat/core-0.4`, `lookupModule` runs
  `bp.moduleByDefinition.get(definition)` on the unreplaced definition, and that map is
  keyed by the replacement the walk visited. So `get(T, { module: Cartography })` under
  `overrideModule(Cartography, Stub)` throws `NEXUS_INVALID_MODULE`. Core §3.5 does not
  define the case, and nothing outside core can fix it.
- Ruling: the option selects the replacement.
- Core §3.5, append after "With the `module` option, `get()` resolves as if called from
  inside that module.": "When a `compile.module` hook replaced that module (section
  3.10.3), the option selects the module that replaced it, so `get(T, { module: Mod })`
  works in a testing container with `overrideModule(Mod, Stub)`. Naming the replacement
  itself also works. `has()`, `resolve()`, `validate()` and a scope's lookups follow the
  same rule, and a plugin finds the same module through `ModuleView.replaced`."
- Controller: add a reverse map (original definition to stub id) on `Blueprint`.
  `lookupModule` falls back to it: `moduleByDefinition.get(d) ?? moduleByReplaced.get(d)`.
  Leave originals out of `moduleByDefinition`, because the `load()` walk treats that map
  as its visited set. `load()` recompiles from the root, so the reverse map is complete
  after every load, lazy overrides included. Tests: `get` and `has` with `{ module: Mod }`
  after `overrideModule`, and after a lazy override plus `load(Mod)`.
- Blocks: the section 13 rule for components that pass `{ module }`, and no export.
- Users: section tests that pass `{ module }` work. 0.3 users are unaffected.

`moduleDefinitionOf`, which R4 uses, is public in the core 0.4 plan (Task R8), and core.md
does not document it. The core controller confirms the export stays.
