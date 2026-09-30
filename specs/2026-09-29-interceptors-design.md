# @nexusdi/interceptors: method interceptors as a plugin

Status: owner decisions O1 (D1), O2 (D4), O4 (D5) and the R11 exemption rule (D3)
accepted 2026-09-30; O3 open. The extension principle spec
(`specs/2026-09-30-extension-principle-design.md`) replaces O5 and amends R9 (V15). Issue: NexusDI/core#17 (Interceptors / Middleware).
Package: `@nexusdi/interceptors`, new, at the workspace's fixed version, with an exact peer
dependency on `@nexusdi/core`.
Builds on: the core 0.4 spec, `specs/2026-09-23-core-0.4-design.md` on
`plan/core-0.4-engine` (revision 2, `7e7623f`): section 0 (D2, D5, D9, D19), section 3.8
(decorators) and section 3.10 (the plugin API). The core code is `feat/core-0.4` (PR #60,
not merged), from `fe6d351`, where the `construct` hook receives the building container
(owner decision D1). That branch implements the plugin API this spec uses, so the
dependency is met in code; it is not on `main` yet.
Prior art: NestJS `@UseInterceptors` and `APP_INTERCEPTOR`, Spring AOP proxies (the
self-invocation rule), TC39 decorator metadata.

## 0. Summary

`@nexusdi/interceptors` wraps the methods of services the container builds. An
interceptor is a provider with an `intercept(call, next)` method. The app registers its
interceptors once, in the `interceptors({...})` plugin, and attaches them globally, per
token, per class or per method. The package changes no core file; it uses the `container`
parameter core's `construct` hook gained for it (owner decision D1), and core's rule that
`construct` receives the provider views `compile.check` saw (core 3.10.3, V15).

```ts
import { Nexus, Token } from '@nexusdi/core';
import {
  interceptor,
  interceptors,
  tap,
  type CallContext,
  type Interceptor,
  type InterceptorMap,
  type Next,
} from '@nexusdi/interceptors';

// AUDIT_LOG, LEDGER, Billing and AuditLogModule are the app's own tokens and modules.
const AUDIT = new Token<Interceptor>('Audit');

class AuditInterceptor implements Interceptor {
  static deps = [AUDIT_LOG] as const;
  constructor(private readonly log: IAuditLog) {}

  intercept(call: CallContext, next: Next) {
    return tap(next, {
      value: () =>
        this.log.write(`${call.provider.name}.${String(call.method)}`),
    });
  }
}

class PaymentService implements IPaymentService {
  static deps = [LEDGER] as const;
  static interceptors = {
    methods: { charge: [AUDIT] },
  } satisfies InterceptorMap<PaymentService>;

  constructor(private readonly ledger: ILedger) {}
  async charge(order: Order) {
    /* ... */
  }
}

await using ship = await Nexus.create(Billing, {
  plugins: [
    interceptors({
      imports: [AuditLogModule],
      register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
    }),
  ],
});
```

## 1. Pillar and users check

| Pillar                         | Effect                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 modern                      | TC39 decorators and `Symbol.metadata`; `Proxy`; no reflect metadata.                                                                                                                       |
| P2 not complicated             | One interceptor contract, one registration point, the same three declaration forms core uses for deps (static field first, decorator second, config for code the user cannot edit).        |
| P3 module system               | Interceptors are providers in a module the plugin contributes. Their deps come from its `imports` and from global modules, under core's encapsulation rules.                               |
| P4 forRoot config              | `interceptors({ register, providers, imports, global, bindings, exempt })` is the one configuration call. `compile.check` reports each fault in it with the graph's other errors.          |
| P5 developer-friendly          | Missing interceptors show in the same `BlueprintError` as wiring errors; `@nexusdi/testing` overrides an interceptor like any provider; `tap()` covers sync and async methods in one call. |
| P6 lightweight                 | Core gains 0 bytes from the package. The package measures 4,388 B gzip (section 8). Its reported errors' text is the opt-in `@nexusdi/interceptors/text` pack, 1,153 B.                    |
| P7 class and factory providers | Interceptors can be class, factory or value providers. Class and factory services are intercepted.                                                                                         |
| P8 async core                  | Async methods keep their promise contract; interceptors are built at `create`.                                                                                                             |
| P9 TS 7                        | Standard decorators only; the static form needs no decorator at all.                                                                                                                       |

Divergences are listed as owner decisions in section 12.

## 2. Design process

An architect drafted the design and a tech lead challenged it. Section 3 holds the
architect draft's open points, and each ruling is the tech lead's final call, checked
against the pillars, users first, bundle cost and DX. The final review of PR #62 added
the exemption rule in R11 through the same two roles, run as separate subagents.

## 3. Rulings

Each entry gives the architect's proposal, the challenge, and the final call.

### R1. How a wrapped method finds its interceptor instances

- Proposal A: capture the container in `setup` and call `container.get(T)` per call.
- Challenge: `setup` runs after `onInit` (core section 8.1, step 4). A singleton whose
  `onInit` calls an intercepted method of another service would find no container. That
  pattern (`onInit() { await this.repo.migrate() }`) is common, so the call would have to
  throw or skip its interceptors. Skipping an auth interceptor is a security bug, and
  throwing breaks startup code that has nothing to do with interceptors.
- Proposal B: the plugin contributes a module holding the interceptors and one private
  singleton factory, the registry, whose deps are every registered interceptor token.
  Core builds it in step 2, before any `onInit`. Its factory hands the instances to the
  plugin's closure.
- Ruling: B. The registry is an ordinary provider, so core validates every interceptor's
  deps, cycles and lifetimes with its own passes, and `@nexusdi/testing` can override an
  interceptor token. A call made before the registry is built (a constructor at a lower
  level that calls a method of its dependency) throws `NEXUS_INTERCEPTOR_NOT_READY`,
  which names the service, the method and the fix. The lazy-thunk variant of B was
  rejected: a thunk reads only `ready` (core section 6.3), so an `onInit` could hit
  `NEXUS_NOT_READY` depending on level order.
- `setup` is not used. The RFC table in core section 3.10.8 listed it; B makes it
  unnecessary.

### R2. Interceptor lifetimes: singleton only in this release

- Proposal: allow scoped interceptors (a request-aware auth check reading `REQUEST`).
- Challenge: the registry is a singleton, and core's pass 5 rejects a singleton that
  reaches a scoped provider through any edge. The plugin cannot learn a provider's
  lifetime before compile, and it cannot map the `scope` id the `construct` hook
  receives to a `Scope` handle to resolve from. See gap G1.
- Ruling: every registered interceptor is a singleton (a value provider also passes).
  A scoped or transient interceptor fails at `create` with the plugin's
  `NEXUS_INTERCEPTOR_LIFETIME`, which states the rule; a transient one would be captured
  once by the registry, which is a silent lifetime change. A singleton interceptor that
  depends on `REQUEST` or on a scoped provider fails with core's
  `NEXUS_LIFETIME_VIOLATION`, which names the path; the plugin adds nothing to it. An interceptor
  that needs request data reads it from `call.instance` (a scoped service holds its
  request) or from `nodeScopes().current()` in `@nexusdi/node`. This is owner decision O2,
  accepted 2026-09-30 as D4: singletons only for now. G1, now in core, is what a later
  release uses to lift the restriction without changing this package's API.

### R3. Where the decorator lives

- Proposal: add `@UseInterceptors` to `@nexusdi/decorators`.
- Challenge: `@nexusdi/decorators` holds DI declarations that core reads. Interceptor
  metadata is read only by this plugin. Putting the decorator there would make
  `@nexusdi/decorators` ship code for a feature most of its users do not install, and
  would tie two packages' release notes together.
- Ruling: `@UseInterceptors` lives in `@nexusdi/interceptors`. The package copies the
  one-line `Symbol.metadata` polyfill (`Symbol.metadata ??= Symbol.for('Symbol.metadata')`),
  which is idempotent with the copy in `@nexusdi/decorators`. `@nexusdi/interceptors`
  has no dependency on `@nexusdi/decorators`.

### R4. Declaration forms

- Proposal: decorators only, as the issue sketches (`@Interceptor`, `@UseInterceptors`).
- Challenge: D2 and D3 make `static deps` the primary form and keep decorators optional,
  because Vite 8 and several toolchains need a plugin to lower them. Interceptors must
  follow the same rule, or the feature is unusable on exactly the toolchains D3 fixed.
  Factory providers and third-party classes cannot carry decorators at all.
- Ruling: three forms, one per job, mirroring core.
  - A class the user owns: `static interceptors = { class?, methods? }`, typed with
    `satisfies InterceptorMap<Self>`. This is the form the docs lead with.
  - The same class with decorators: `@UseInterceptors(A, B)` on the class or on a
    method.
  - A token whose provider the user cannot edit, or a factory provider:
    `interceptors({ bindings: [{ token, class?, methods? }] })`.
  - Global: `interceptors({ global: [...] })`.
- No `@Interceptor` marker. Registration in `interceptors({ register })` is what makes a
  provider an interceptor; a marker would be a second, unchecked way to say it.
- A class that declares both an own `static interceptors` and own decorator metadata is
  `NEXUS_INTERCEPTOR_INVALID` (`reason: 'two-forms'`), since the merge order between them
  would be arbitrary.

### R5. Order and duplicates

- Ruling: the chain runs outermost first, in this order:
  1. global entries, in config order, that match;
  2. bindings for the provider's token, in config order;
  3. class-level declarations, base class first, then each subclass;
  4. method-level declarations for the called method.
- Within one list, tokens run in written order. Stacked decorators run top to bottom:
  `@UseInterceptors(A)` above `@UseInterceptors(B)` gives `A` then `B`.
- A token that appears twice in one chain runs once, at its first (outermost) position.
  A global logger plus a class-level logger would otherwise log every call twice, which
  no user wants.
- Method-level declarations follow core's deps rule for inheritance: a subclass that
  declares interceptors for a method name replaces the base class's list for that name;
  one that does not inherits it. Class-level lists accumulate, like core's property
  injections.

### R6. `this`, identity and self calls

- Ruling: the container stores and returns a `Proxy` of the instance. A wrapped method
  runs with `this` set to the raw instance, so private fields (`#x`) work and a call from
  one method to another on `this` is not intercepted, as in Spring AOP. `get()` returns
  the proxy, `instanceof` still holds, and `get(T) === this` inside the class is false.
  The docs page states all three. Methods the plugin does not intercept are still bound
  to the raw instance (cached per instance and key), because core calls `onInit` and
  the disposers through the proxy and a class with private fields would otherwise throw.
- Owner decision O4, accepted 2026-09-30 as D5: a self call through `this` is not
  intercepted. The docs say so the way NestJS documents its proxy-based enhancers: a call
  from one method to another on `this` bypasses the proxy, so its interceptors do not run;
  to intercept it, call the method through the injected token, or move it to another
  service.
- Accessors (`get`/`set`) are read and written on the raw instance and are never
  intercepted.

### R7. Sync and async methods

- Ruling: the chain is synchronous function composition. `next()` returns what the
  method returns: a value, or a promise for an async method. An interceptor returns
  what the caller should see, of the same shape.
- For a method declared `async` (its `Object.prototype.toString` tag is
  `AsyncFunction`), the wrapper turns a synchronous throw from any interceptor into a
  rejected promise, so `svc.charge().catch(...)` catches a validation interceptor's
  error. `call.async` exposes the flag. A plain method that returns a promise keeps a
  synchronous throw synchronous; the wrapper cannot know its shape before calling it.
- `tap(next, { value?, error? })` runs `next()` and calls `value` with the result or
  `error` with the failure, for sync results, returned promises and synchronous throws
  alike, then returns or rethrows the original. Logging, metrics and tracing need
  exactly this, and without it every interceptor would carry the thenable branch.
  `tap` is the package's only helper.
- `next(args)` replaces the arguments for the rest of the chain. `next()` may be called
  more than once (a retry interceptor) or not at all (a cache hit).

### R8. Global filters and opting out

- Proposal: a `@SkipInterceptors()` decorator.
- Ruling: no skip decorator. A global entry takes `when(target)`, called once per
  (provider, method) pair and cached. It covers health checks and hot paths without a
  second decorator and works for code with no decorators.

### R9. One container per plugin object

- Challenge: a plugin object registered in two live containers must keep their registries
  and their container-local ids apart.
- Ruling: `interceptors()` returns a new plugin per call, and a plugin object serves one
  live container at a time. Sessions hang off a compile. `compile.check` writes one
  compile record per `create` or `load`, and the record holds the session of the
  container that runs it. The `construct` hook receives the building container (core G1,
  owner decision D1), and the plugin uses it only to name the session's container.
- Core hands `construct` the same `ProviderView` objects that the compile's
  `compile.check` hooks received, and keeps them for as long as the blueprint lives
  (core 3.10.3 and 3.10.4, V15). For a `create` or `load`, `compile.check` writes an
  entry for every class and factory provider into a `WeakMap<ProviderView,
CompiledProvider>`: the compile record, whether the provider is the plugin's registry
  or guard, and whether global entries skip it (R11). A provider with nothing to wrap
  maps to `null`. `construct` reads the entry of the view it receives and the
  session of the entry's compile. A `create`'s record starts with no session, and its
  first build, always the guard's (a singleton with no deps), claims the plugin object
  and opens it. A `load` runs inside the one live container, so its record joins that
  container's session. A scope opened before a `load` keeps the entries of the
  blueprint it saw. A view with no entry means a core that breaks V15 or a caller of the
  hook outside core, and `construct` throws `NEXUS_INTERCEPTORS_UNCHECKED`.
- A container is live until its disposal starts or its `create` fails; the plugin tests it
  with `has()`, which throws `NEXUS_DISPOSED` then. A `create` that compiles while a live
  container holds the plugin object reports `NEXUS_INTERCEPTORS_SHARED` before any build,
  so the live container's ids and instances are untouched (final review F1 and I3). Two
  overlapping `create` calls give one container: the first to build claims the plugin
  object, and the other fails its first build with `NEXUS_INTERCEPTORS_SHARED`.
- A session closes when the plugin's `dispose` hook runs for its container, or, for a
  `create` that fails after its first build, when core disposes the plugin's guard
  provider with the rest of the failed build (section 6). The `dispose` hook names no
  container, so it closes each started session whose container is closed. A container
  that claims the plugin object while an older one is disposing keeps its own session,
  and the older container's disposers still run their interceptors.
- Resolved residual: a compile that fails keeps nothing, since core drops its views, so
  the next `create` with that plugin object runs.
- A scope whose first build runs after its root started disposing reads its root's
  entries, so its scoped instances are wrapped with the root's session. After the
  plugin's `dispose` hook closes that session, their calls throw
  `NEXUS_INTERCEPTOR_NOT_READY`.

### R10. No per-call context token

- The RFC table in core section 3.10.8 named `modules` for "a per-call context token".
  An ambient token needs an async context, which core does not have (D20).
- Ruling: the call context is the first argument of `intercept`. `modules` carries the
  interceptors' own module instead.

### R11. What is intercepted

- Class and factory providers only. The `construct` hook never runs for `useValue` or
  `useExisting` (core section 3.10.4); an alias returns its target's proxy.
- Candidate methods: function-valued properties found on the instance or its prototype
  chain, excluding `constructor`, `onInit`, `then`, members of `Object.prototype`, and
  symbol keys. A symbol-keyed method is intercepted only when a method-level declaration
  names it.
- The providers in the plugin's own module (the interceptors and the registry) are never
  intercepted, so an interceptor cannot recurse into itself through a global entry.
- Global entries also skip every provider the plugin's module reaches through a
  dependency edge of any kind, lazy included, transitively (final review F2). A global
  logging interceptor that calls `journal.write()` would otherwise intercept that call
  and recurse until the stack overflows. A per-call re-entrancy guard was rejected: it
  holds only while the interceptor runs synchronously, and an async interceptor that
  writes after an `await` would still recurse. Skipping only the calling interceptor's
  own deps was rejected too: two global interceptors whose deps call each other still
  recurse. Declarations and bindings still apply to these providers, since the user
  named them.
- The skip is never inferred silently (final review I4). A root is a provider outside the
  plugin's module, other than a value provider, that a provider inside it depends on
  directly. The contributors of one `MultiToken` an `all()` dep names count as one
  root, listed by the multi token. Tokens compare through `view.canonical`, so a
  `tokenKey` plugin does not hide a match. With `global` entries, `compile.check`
  requires every root in
  `interceptors({ exempt })` and reports `reason: 'unexempted-dep'` for each one
  missing, with `detail` listing every provider the exemption would skip. An `exempt`
  token that is not a root reports `reason: 'unused-exempt'`, with `detail` naming the
  root that already covers it, so a stale entry cannot keep a service out of global
  coverage. Deps in the plugin's own `providers` need no entry; deps from `imports` do,
  since an implicit exemption there is the silent skip this rule removes. Without
  `global` entries neither check runs, so `global: prod ? [AUDIT] : []` works. Lazy
  edges count because a lazily injected service is called inside `intercept`, which is
  what `lazy` exists for. Known gap: a provider an exempt root gains as a new dep later
  joins the skip set without an error; listing the whole transitive set would close it
  and was rejected as too noisy.
- The exemption rule and its `unexempted-dep`, `unused-exempt` and `self-intercept`
  errors were accepted by the owner on 2026-09-30 (D3).
- A registered interceptor that a provider in its own dep closure names in a class list
  or a binding's class list would run again on each call it makes into that provider.
  `compile.check` reports `reason: 'self-intercept'` for it. Method lists are not
  checked, since the plugin cannot tell which methods the interceptor calls.
- Rejected for I4: excluding lazy edges from the walk (the interceptor still calls the
  lazy service and recurses); a trace event, a devtools annotation, a pull API or a debug
  option (each needs a core change or stays silent unless the user asks); opting a
  provider back in (a global entry on a service its interceptor calls recurses by
  construction; `when` and bindings cover the safe subsets).
- A provider with no matching global entry, binding or declaration is not wrapped: the
  hook returns `undefined` and the instance stays unproxied.

### R12. Registration shape

- Proposal: `interceptors({ providers })`, a plain module `providers` list.
- Challenge: core's `Provider` is opaque (`provide()` returns a branded object with no
  readable token), so the plugin could not tell which entries are interceptors or list
  the registry's deps. Provider literals expose a token, but D2 moved them to the
  migration page.
- Ruling: `register` takes interceptor classes and `interceptor(TOKEN, definition)`
  entries. `interceptor()` has `provide()`'s definition shapes, typed to `Interceptor`,
  and returns `{ token, provider }`. `providers` stays for helpers the interceptors
  depend on; they are private to the plugin's module and never registered as
  interceptors.

### R13. Errors

One error class, `InterceptorError`, built with core's `errorBase`, with codes:

| Code                           | When                                                                                                                            | Raised by                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NEXUS_INTERCEPTOR_INVALID`    | bad `interceptors()` options; bad declaration; a legacy decorator call; an interceptor instance without an `intercept` function | the decorator, `compile.check`, the registry build, or the wrapper |
| `NEXUS_INTERCEPTOR_MISSING`    | a declaration, binding or global entry names a token that `interceptors({ register })` does not register                        | `compile.check`                                                    |
| `NEXUS_INTERCEPTOR_LIFETIME`   | a registered interceptor is scoped or transient                                                                                 | `compile.check`                                                    |
| `NEXUS_INTERCEPTOR_NOT_READY`  | a call before the registry is built, or after the container is disposed                                                         | the wrapper                                                        |
| `NEXUS_INTERCEPTORS_SHARED`    | the plugin object is already bound to a live container                                                                          | `compile.check`, or the first build of an overlapping create       |
| `NEXUS_INTERCEPTORS_UNCHECKED` | `construct` received a provider view no `compile.check` of the plugin saw (R9)                                                  | the `construct` hook                                               |

Fields: `code`, `reason` (for `INVALID`: `'options' | 'declaration' | 'unknown-method' |
'two-forms' | 'private-method' | 'static-method' | 'bad-target' | 'legacy-decorators' |
'no-intercept' | 'bad-next' | 'unexempted-dep' | 'unused-exempt' | 'self-intercept'`,
else `null`), `token` (display name or `null`), `target` (the provider or class name, or
`null`), `method` (string, or `null`), `state` (`'building' | 'disposed'` for
`NOT_READY`, else `null`), `detail` (strings: for `'options'` the rule broken, then the
value received; for `'unexempted-dep'` the providers the exemption would skip; for
`LIFETIME` the lifetime found; else what the fault names, or empty).

Text follows the extension principle spec, section 2.5.1. An error `compile.check`
reports, and a call-time `MISSING` or `bad-next` fault the wrapper throws once the
container ran `setup`, carries core's one line of fields and the code's docs link. The
wrapper throws the latter through `context.format`. `interceptorsText` from
`@nexusdi/interceptors/text` words them, registered with
`errors({ text: [interceptorsText] })`. An error thrown where no container formatter
runs carries its own text: the decorator's faults, `NOT_READY`, `UNCHECKED`, and the
`construct` hook's `no-intercept`, binding `unknown-method`, frozen-function
`bad-target` and `SHARED`. Core wraps a `construct` throw as a cause. A call-time
`MISSING` or `bad-next` fault raised before `setup`, as from an `onInit`, finds no plugin
context to format it, so it carries the same words as the pack, which both take from
`call-text.ts`. An error an
interceptor throws in the call path is never wrapped: the caller receives it as thrown.
`next()` called with arguments that are not an array throws `NEXUS_INTERCEPTOR_INVALID`
(`reason: 'bad-next'`).

### R14. Decorator-free metadata key and pollution

- Ruling: decorator metadata is stored under `Symbol.for('nexusdi.interceptors')`, so a
  class decorated with one copy of the package is read by another. Static fields and
  metadata are read with `Object.hasOwn` level by level, so a polluted
  `Object.prototype.interceptors` never attaches an interceptor (SEC-013).

## 4. Public API

```ts
/** A method interceptor. Registered in interceptors({ register }). */
export interface Interceptor {
  intercept(call: CallContext, next: Next): unknown;
}

export interface CallContext {
  /** The raw instance; `this` inside the method. */
  readonly instance: object;
  /** The provider that built the instance (core's frozen view). */
  readonly provider: ProviderView;
  readonly method: string | symbol;
  /** The arguments this interceptor received. */
  readonly args: readonly unknown[];
  /** The method is declared async. */
  readonly async: boolean;
  /** The scope id that built the instance, or null for the root. */
  readonly scope: string | null;
}

/** Runs the rest of the chain and the method; `args` replaces the arguments. */
export type Next = (args?: readonly unknown[]) => unknown;

export type InterceptorToken = InjectionToken<Interceptor>;

/** The shape of `static interceptors` and of a binding. */
export interface InterceptorMap<T = unknown> {
  readonly class?: readonly InterceptorToken[];
  readonly methods?: {
    readonly [K in MethodKey<T>]?: readonly InterceptorToken[];
  };
}
/** Method names of T; `string` when T is unknown. */
export type MethodKey<T>;

export interface GlobalEntry {
  readonly use: InterceptorToken;
  /** Called once per provider and method; false skips it there. */
  readonly when?: (target: {
    readonly provider: ProviderView;
    readonly method: string | symbol;
  }) => boolean;
}

export interface InterceptorBinding extends InterceptorMap {
  readonly token: InjectionToken<unknown>;
}

export interface InterceptorsOptions {
  /** The interceptors: a class (its own token) or an interceptor() entry. */
  readonly register: readonly (InterceptorClass | InterceptorEntry)[];
  /** Other providers the interceptors depend on, private to the plugin's module. */
  readonly providers?: readonly ProviderEntry[];
  /** Modules the interceptors' own deps come from. */
  readonly imports?: readonly ModuleRef[];
  readonly global?: readonly (InterceptorToken | GlobalEntry)[];
  readonly bindings?: readonly InterceptorBinding[];
  /** Services outside `providers` the interceptors depend on; global entries skip them (R11). */
  readonly exempt?: readonly (InjectionToken<unknown> | MultiToken<unknown>)[];
}

/** A class that implements Interceptor and declares its deps like any provider. */
export type InterceptorClass = Ctor<Interceptor>;

/** An interceptor bound to an interface token, typed like provide(). */
export interface InterceptorEntry {
  readonly token: InterceptorToken;
  readonly provider: Provider<Interceptor>;
}
export function interceptor<C extends Ctor<Interceptor>>(
  token: InterceptorToken,
  definition: { useClass: C; deps?: DepsFor<C>['deps'] } | { useValue: Interceptor },
): InterceptorEntry;
export function interceptor<const D extends readonly Dep[]>(
  token: InterceptorToken,
  definition: { deps?: D; useFactory: (...deps: ResolveAll<D>) => Interceptor },
): InterceptorEntry;

export function interceptors(options: InterceptorsOptions): NexusPlugin;

/** Class or method decorator. */
export function UseInterceptors(
  ...tokens: InterceptorToken[]
): (target: unknown, context: ClassDecoratorContext | ClassMethodDecoratorContext) => void;

export function tap<R>(
  run: () => R,
  observer: { value?(value: unknown): void; error?(error: unknown): void },
): R;

export class InterceptorError /* extends NexusError, section R13 */ {}

// @nexusdi/interceptors/text
export const interceptorsText: ErrorTextPack;
```

`interceptors()` parses its options when it is called. Its `compile.check` reports
`NEXUS_INTERCEPTOR_INVALID` (`reason: 'options'`), one error per fault, for a missing or empty `register`
array, a `register` element that is neither a class nor an `interceptor()` entry, a token
registered twice, a
non-token in `global`, `bindings`, `class`, `methods` or `exempt`, a binding key other
than `token`, `class` and `methods`, a `when` that is not a function, or an
`interceptor()` entry whose token is neither a `Token` nor a class. With a fault, the
plugin contributes no module, and every hook but `compile.check` does nothing. The
plugin's `name` is `nexus:interceptors`, and its module is named `interceptors`.

The decorator throws `NEXUS_INTERCEPTOR_INVALID` at class definition for a legacy
(`experimentalDecorators`) call, a private method, a static method, and any target other
than a class or a method.

## 5. How it works

### 5.1 The module and the registry

`interceptors(options)` builds one module:

```ts
defineModule({
  name: 'interceptors',
  imports: options.imports ?? [],
  providers: [
    ...registered.map((entry) => entry.provider),
    ...(options.providers ?? []),
    provide(REGISTRY, { deps: registeredTokens, useFactory: bind }),
    provide(GUARD, { useFactory: guard }),
  ],
});
```

`registered` is `options.register` normalised to `{ token, provider }`: a class is its
own token and provider, and an `interceptor()` entry already has both. `registeredTokens`
is their tokens. `REGISTRY` and `GUARD` are module-private `Token`s.
`bind(...instances)` checks each instance has an `intercept` function
(`reason: 'no-intercept'`) and returns `Map<token, Interceptor>`, which the
`construct` hook stores on the session of the registry's compile. It has no disposer. `guard()` has no deps, so core builds it in
the first level; its disposer closes the session when the container never finished
`create` (section 6).

### 5.2 The construct hook

`construct(instance, provider, scope, container)`:

0. Reads the entry `compile.check` wrote for `provider` (R9), and throws
   `NEXUS_INTERCEPTORS_UNCHECKED` when there is none. The session is the entry's
   compile's; a `create`'s first build opens it and claims the plugin object.
1. Returns `undefined` for a provider with nothing to wrap, such as one of the plugin's
   own module, and for an instance that is not an object or function. `compile.check`
   finds the plugin's module in `view.modules` (the entry whose `definition` is the
   plugin's module) before any build. For the registry it stores the interceptor map on
   the session, and for the guard it returns a disposer bound to the session (section
   6).
2. Reads the provider's declarations: bindings for `provider.token` or
   `provider.written`, and, when `provider.implementation` is a class, its static form
   and decorator metadata up the class chain (R5).
3. Returns `undefined` when no global entry exists and nothing is declared.
4. Checks every method-level name of a binding exists on the instance
   (`reason: 'unknown-method'`); a class provider's names were checked at compile.
5. Returns `new Proxy(instance, handler)`.

The handler's `get(target, key)` reads `Reflect.get(target, key, target)`. A non-function
value, an accessor, `constructor` and any class (a function whose `prototype` is
read-only, such as `this.Model = Model`) return as read, so `svc.constructor === Svc`
and `new svc.constructor()` hold. `onInit` and `then` are bound to the raw instance and
never intercepted, since core calls them through the proxy. For a function it returns a
wrapper cached per key: the chain is computed once per (provider, key), resolved to
instances once per binding, and applied per call. `set` writes through with the raw
target as receiver. Every other trap is the default.

### 5.3 A call

```text
wrapper(...args)
  -> binding missing?      NEXUS_INTERCEPTOR_NOT_READY (state 'building' or 'disposed')
  -> chain empty?          method.apply(target, args)
  -> run(0, args)          interceptors[i].intercept(context(args), (next) => run(i + 1, next ?? args))
                           last step: method.apply(target, args)
  -> call.async and a sync throw?  Promise.reject(error)
```

A `CallContext` is a new frozen object per interceptor step, so an interceptor that keeps
it sees the arguments it received.

### 5.4 compile.check

Runs for `create`, `load` and `Nexus.check`, over `view.providers`:

- Each class provider's declarations: two forms (`two-forms`), method names that are not
  functions on the prototype chain (`unknown-method`), and tokens not registered
  (`NEXUS_INTERCEPTOR_MISSING`, with `target` and `method`).
- Each global entry and binding token that is not registered (`MISSING`).
- Each registered interceptor provider with `lifetime` `'scoped'` or `'transient'`
  (`NEXUS_INTERCEPTOR_LIFETIME`).
- With `global` entries, each root missing from `exempt` (`unexempted-dep`) and each
  `exempt` token that is not a root (`unused-exempt`) (R11).
- Each provider in a registered interceptor's dep closure whose class list or binding
  class list names that interceptor (`self-intercept`, R11).
- The faults of the plugin's options, for every phase (section 4).
- For `create` and `load`: a live container holding the plugin object
  (`NEXUS_INTERCEPTORS_SHARED`, `create` only), then an entry per class and factory
  provider view, keyed by the view: the compile record, whether it is the registry or
  the guard, and whether it is reached through the plugin module's dependency edges. A
  `create`'s record starts with no session; a `load`'s joins the live container's (R9,
  R11). The check writes the entries whether or not the compile fails, since core drops
  the views of a failed compile.

Tokens compare through `provider.token` and `provider.written`, so a `tokenKey` plugin
(`@nexusdi/federation`) does not hide a match. A binding whose token has no provider is
not reported: a later `load()` may bring it.

## 6. Disposal

Interceptors are providers, so core disposes them in reverse creation order with the
rest of the root. The plugin's `dispose` hook, which core runs after every instance the
container owns (core section 3.10.5), closes each started session whose container's
disposal has started. A disposer that calls an
intercepted method of a dependency therefore still runs its interceptors (final review
I1). A wrapped method called after the hook throws `NEXUS_INTERCEPTOR_NOT_READY` with
`state: 'disposed'`, since running a disposed interceptor, or skipping an auth
interceptor, is worse than a clear error. The session drops its interceptor map, so a
kept plugin object holds no disposed instances.

Core runs a plugin's `dispose` hook only after the build succeeded and that plugin's
setup step ran, including when a later plugin's setup fails. For a `create` whose build
fails, core disposes what it built, the guard included, and the guard's disposer closes
the session. The plugin's `setup` hook marks the session of `context.container` started,
so from then on the guard does nothing and the `dispose` hook closes the session.
Closing twice is harmless.

## 7. Testing

- Unit test of an interceptor: construct it with fakes and call
  `intercept(call, next)` with a hand-written `CallContext` and a `next` spy. The
  context is a plain interface, so no helper is exported.
- Integration with `@nexusdi/testing`:

  ```ts
  const ship = await createTestingContainer(Billing)
    .override(AUDIT, { useValue: { intercept: (_call, next) => next() } })
    .create({
      plugins: [
        interceptors({
          register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
        }),
      ],
    });
  ```

  `override` reaches the interceptor because it is a provider in the plugin's module,
  and `NEXUS_OVERRIDE_UNUSED` still fires for a misspelt token.

- Turning interceptors off in a test: leave the plugin out. A declaration without the
  plugin is inert metadata.

## 8. Bundle cost

- Core: 0 bytes from this package. The `container` parameter it uses (D1) grew core from
  18,317 B to 18,446 B gzip.
- `@nexusdi/interceptors`: 4,388 B gzip for the plugin, the proxy and `tap`, measured
  by `scripts/size-report.mjs` over `examples/size/src/interceptors.ts` with the method
  of core section 12.4. The first cut measured 3,752 B, of which about 0.9 KB was
  inline error text. The session lifecycle fix (R9, section 6), the exemption checks
  (R11) and keying sessions per container took it to 4,313 B with no text of its own.
  The text of the errors thrown where no container formats them (R13) took it to
  4,782 B, and keying compiles by provider view (R9, V15) brought it to 4,388 B. The
  draft's 1.4 to 1.9 KB estimate did not count the compile checks or the frozen object
  path.
- `@nexusdi/interceptors/text`: 1,153 B gzip, measured over
  `examples/size/src/interceptors-text.ts`. An app pays it only when it imports the
  subpath to register `errors({ text: [interceptorsText] })`. `@nexusdi/errors` carries
  no interceptor text.
- Runtime: a proxied instance costs one `get` trap per property read and one `Map`
  lookup per method read. An unintercepted provider costs one `construct` call at build
  and nothing per call.

## 9. Package layout

```text
libs/interceptors/
  package.json          name @nexusdi/interceptors, peer @nexusdi/core exact, sideEffects: the polyfill
  project.json, tsconfig*.json, vite.config.ts, eslint.config.mjs   generated, then aligned with libs/devtools
  README.md             doc-tested examples (tools/doc-examples)
  SECURITY.md           SEC-013
  src/
    index.ts
    interceptor-error.ts  InterceptorError and its factories
    types.ts              Interceptor, CallContext, Next, InterceptorMap, options types
    tap.ts
    polyfill/symbol-metadata.ts
    metadata.ts           METADATA_KEY, writing and reading declarations
    use-interceptors.ts   the decorator
    options.ts            interceptors() option validation and interceptor()
    chain.ts              chain computation (R5, R8, R11)
    proxy.ts              the handler and the call (5.2, 5.3)
    check.ts              compile.check (5.4)
    plugin.ts             interceptors(): module, registry, construct, check
    text.ts               interceptorsText, the ./text entry (R13)
    call-text.ts          the call-time MISSING and bad-next wording, shared by text.ts and proxy.ts (R13)
```

Repository collateral, as for `@nexusdi/devtools`: the root `tsconfig.json` reference,
the `interceptors` commitlint scope, `.fallowrc.jsonc` (`publicPackages` and the
`*.test-d.ts` entry glob), `scripts/verify-packaging.mjs` (`LIBS` and a smoke check), and
`examples/size` (dependency, and the `interceptors` and `interceptors-text` fixtures).

## 10. Documentation

The package README carries doc-tested examples. The docs site page belongs to the docs
spec; this spec requires that page to state R6's three identity rules and R2's lifetime
rule. Every example after the first is interface-first (`Token<IFoo>` with `useClass`).

## 11. Core gaps

G1. The `construct` hook receives the scope id as a string and no container handle, and
a plugin first receives the container in `setup`, after `onInit`.

- Consequences here: interceptors must be singletons (R2); a plugin object serves one
  container (R9); the plugin needs a registry provider to reach its interceptors before
  `onInit` (R1).
- Recommendation: add a fourth parameter to `construct`,
  `container: Nexus | Scope`, the container building the instance. It is additive under
  core section 3.10.2 (an existing plugin ignores it) and keeps section 3.10.9's rule
  that a plugin sees instances only through `construct` and a container. Est. under
  0.05 KB in core. With it, the wrapper resolves each interceptor from the building
  container at call time, scoped interceptors work, the one-container rule goes, and the
  registry stays only as the startup guarantee of R1. This package's public API does not
  change.
- Status: accepted by the owner on 2026-09-30 (D1) and in core on `feat/core-0.4`. This
  package uses the parameter only to name the session's container, which a `create`'s
  first build records (R9); the compile a provider view belongs to finds the session.
  Scoped interceptors and shared plugin objects stay out of this release (D4).

No other gap. `compile.check`, `modules`, `construct` and the frozen `ProviderView` cover
the rest.

## 12. Owner decisions

O1. Accepted 2026-09-30 (D1). Core gap G1: add `container: Nexus | Scope` as a fourth
`construct` parameter.
What: a new public core plugin-API parameter. Why: without it a plugin cannot resolve
from the scope that built an instance or tell two containers apart. Consequence if
accepted: scoped interceptors and shared plugin objects in a later minor, with no API
change here; if declined, R2 and R9 stay permanent.

O2. Accepted 2026-09-30 (D4): singletons only for now. Interceptors are singletons only
in this release (R2). What: a scoped or transient
interceptor fails at `create`. Why: the registry is a singleton and core's lifetime pass
rejects it reaching a scoped provider; G1 is not in core. Consequence: request-aware
interceptors read request data from the intercepted scoped service or from
`@nexusdi/node`'s `nodeScopes()`, which diverges from NestJS, where a request-scoped
interceptor is normal.

O3. New package `@nexusdi/interceptors` with public API `interceptors()`, `interceptor()`,
`UseInterceptors`, `tap`, `InterceptorError` and the types of section 4. What: an eighth
optional package at the fixed version. Why: D9's placement rule puts features core does
not need in packages. Consequence: one more package to release and document.

O4. Accepted 2026-09-30 (D5); the docs state the self-call rule as NestJS documents it.
`get()` of an intercepted service returns a `Proxy`, and self calls are not intercepted
(R6). What: identity and self-invocation semantics users can observe. Why:
the `construct` hook replaces the instance, and running methods on the raw instance is
the only way private fields keep working. Consequence: `get(T) === this` is false inside
the class, and a method that calls `this.other()` skips `other`'s interceptors.

O5. Replaced by the extension principle spec (`specs/2026-09-30-extension-principle-design.md`,
sections 2.5.1 and 2.5.12). What: the text of the errors this package reports or formats
lives in its own pack, `interceptorsText` at `@nexusdi/interceptors/text`, which the app
registers with `errors({ text: [interceptorsText] })`. Errors thrown where no container
formats them carry their own text. Why: text lives with the package that raises it, so a
pack cannot drift from its error fields, and `@nexusdi/errors` stays the engine for every
package. Consequence: `errors()` and `devtools()` carry no interceptor text, the pack
costs 1,153 B gzip only for apps that import it, and an app that leaves it out sees core's
one line with the docs link.

The exemption rule of R11, with the `unexempted-dep`, `unused-exempt` and
`self-intercept` errors, was accepted on 2026-09-30 (D3).

## 13. Out of scope

- Interceptors on `get()` itself or on construction (core rejected a `get()` hook,
  section 3.10.8).
- Property access interception and accessors.
- Observable or stream results; a method returning an async iterator is intercepted as a
  call that returns an object.
- Framework-adapter middleware (HTTP handler chains). The adapters own request pipelines.
