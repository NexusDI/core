# Lifecycle and disposal comparison: research

Read on 2026-10-03. Every cell in the comparison table traces to a source below. "Source" means the published npm tarball (`npm pack <name>@<version>`), read file by file. Official docs are cited where they exist and say the same thing.

Versions read:

| Library     | Version                                                                                                    | Source read                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| NexusDI     | workspace, `release/0.4`                                                                                   | `libs/core/src/runtime/`                                           |
| InversifyJS | inversify 8.2.3, @inversifyjs/container 3.1.3, @inversifyjs/core 15.0.1, @inversifyjs/plugin-dispose 0.4.7 | npm tarballs                                                       |
| tsyringe    | 4.10.0                                                                                                     | npm tarball, README                                                |
| awilix      | 13.0.5                                                                                                     | npm tarball, README                                                |
| needle-di   | @needle-di/core 1.2.1                                                                                      | npm tarball, https://needle-di.io/llms-full.txt                    |
| TypeDI      | 0.10.0 (latest on npm)                                                                                     | npm tarball                                                        |
| NestJS      | @nestjs/core 12.1.2                                                                                        | npm tarball, https://docs.nestjs.com/fundamentals/lifecycle-events |

The benchmark harness pins inversify 8.2.3, tsyringe 4.10.0, awilix 13.0.5 and needle-di 1.2.1 (`benchmarks/libraries.json`). TypeDI and NestJS are not in the harness, so their versions are the latest on npm on the read date.

## NexusDI

All in `libs/core/src/runtime/`.

- Startup hook. `init.ts` `runInit` calls `onInit` on each new singleton through `buildLevels` (`build-levels.ts`). Levels come from `bp.singletonLevels`, dependencies first. Calls inside one level run together (`settleLevel`, `Promise.allSettled`). The next level waits for the previous one. A level that throws stops later levels. `startup.ts` `startBlueprint` runs `runInit` after every singleton is built and before `Nexus.create` resolves, and on failure rolls back by disposing what it built, newest first.
- Container disposal. `nexus.ts` defines `[Symbol.asyncDispose]()`, and `scope.ts` does the same for scopes. `dispose.ts` `disposeObject` awaits `Symbol.asyncDispose` and otherwise calls `Symbol.dispose`. A second call returns the first promise (`root.disposal ??=`).
- Order. `shutdown.ts` `releaseInstances` disposes open scopes newest first, then `disposeInReverse(root.owned)`, which pops entries one at a time, last first. `root.owned` is in creation order, and creation follows the dependency levels.
- Failures. `disposeInReverse` catches each disposer error and goes on. `chainErrors` folds the list the way `DisposableStack` does, using `SuppressedError` or `NexusSuppressedError` (same name and fields) where the runtime has none.
- Ownership. `ownership.ts`: an object is tracked unless it is already tracked or registered as a `useValue`. `build.ts` `adopt` hands class and factory results to the owner. `takeOwnership` gives a root transient no owner and emits an `untracked` event when it has a disposer. Scopes own the transients and scoped instances they build.
- Dependency check on `useValue`: `claimInit` also skips `useValue` objects, so `onInit` never runs on them.

Comparison with `apps/docs/content/lifecycle.mdx`: every claim matches the code. Two details the page leaves out: `onInit` also runs on a singleton that a factory returns (`init.ts` takes any singleton instance that is not a `useValue`), and independent singletons in the same level run `onInit` together. The page says neither, and neither contradicts it.

## InversifyJS 8.2.3

- Startup hook. `@postConstruct` runs per instance when the instance is built, during the first resolution, not in a startup pass. `@inversifyjs/core` `resolvePostConstruct.js` awaits a returned promise. The sync `get` throws "Unexpected asynchronous service when resolving service" (`@inversifyjs/container` `ServiceResolutionManager.js`), so an async hook needs `getAsync`. Dependencies resolve first, so a dependency's hook finishes first.
- Container disposal. `Container` has no `dispose()`. `unbindAllAsync()` and `unbindAll()` run the deactivation process (`@inversifyjs/container` `BindingManager.js` `#unbindAll`), docs: https://inversify.io/docs/api/container/ ("Removes all bindings in this container synchronously. This will result in the deactivation process."). `@inversifyjs/plugin-dispose` 0.4.7 adds `container[Symbol.dispose]` and `container[Symbol.asyncDispose]` once registered (`PluginDispose.js`, README).
- Which instances. `resolveBindingsDeactivations.js` keeps only singleton-scoped bindings whose value is cached. `onDeactivation` is rejected on a non-singleton binding (`BindingFluentSyntaxImplementation.js`: "Deactivation functions can only be used with singleton bindings"). Transients and request-scoped instances are never deactivated.
- Order. Core `#unbindAll` maps every service id to its deactivations and waits with `Promise.all`, so async deactivations overlap and no order is specified. The plugin sorts singleton bindings by `dependendentBindings.size` ascending and runs them one after another (`PluginDispose.js`).
- Failures. Core: a sync throw escapes the loop, and `Promise.all` rejects with the first rejection. Plugin: the chain is `result.then(...)`, so a rejection skips the bindings after it, and the sync path throws on the first error. No aggregate.
- Ownership. `@preDestroy` applies to Instance bindings only (`resolveBindingPreDestroy.js`). `toConstantValue` creates a singleton-scoped binding with `onDeactivation: undefined`, so a constant is disposed only when the user adds `onDeactivation`. A factory or dynamic-value binding is the same.

## tsyringe 4.10.0

- Startup hook. None in `dist/cjs`. The README documents `afterResolution` interceptors that can run init code (https://github.com/microsoft/tsyringe#interception), which are user callbacks, not a lifecycle hook.
- Container disposal. `dependency-container.js` `dispose()` (async) sets `disposed`, calls `dispose()` on each tracked instance and awaits `Promise.all` of the returned promises. README "Disposable instances": https://github.com/microsoft/tsyringe#disposable-instances. No `Symbol.dispose` or `Symbol.asyncDispose` anywhere in the package. `types/disposable.js` accepts an object only when `dispose` is a function with zero parameters.
- Order. `disposables` is a `Set`, so insertion order. An instance is added after `construct()` returns, so dependencies come before their dependents. `forEach` starts the calls in that order and does not wait between them. The order is dependency first, the opposite of reverse creation.
- Failures. A sync throw inside `forEach` aborts the loop, so later instances are not disposed, and the async function rejects with that error. Rejected promises: `Promise.all` rejects with the first. No aggregate.
- Ownership. `construct()` adds every disposable instance it builds, so transients are tracked by the container that resolved them. `useValue`, `useFactory` and `useToken` results never pass through `construct()`, so they are not disposed (`resolveRegistration`). A child container tracks its own instances. `dispose()` has no reference to child containers.

## awilix 13.0.5

- Startup hook. None in `lib/`. The README documents no init hook.
- Container disposal. `container.js` `dispose()` plus `.disposer(fn)` on a resolver. README "Disposing": https://github.com/jeffijoe/awilix#disposing ("If it returns a Promise, it will be awaited by `dispose`."). It calls only the registered `disposer`, never `Symbol.dispose` or a `dispose` method on the instance. No `Symbol.dispose` in the package.
- Order. `dispose()` copies `container.cache`, clears it, and starts every disposer inside `Promise.all(entries.map(...))`. All disposers run together, with no ordering.
- Failures. `Promise.all` rejects with the first rejection. The other disposers have started and run. A later failure is not reported.
- Ownership. Only singleton and scoped values are cached (`container.js`, lifetime switch), so only they are disposed. README: "Disposables must be either `scoped` or `singleton`" and "the container being disposed will not dispose its' scopes. It only disposes values in it's own cache." `asValue` has no lifetime, so it is transient and never cached, and is never disposed. A transient is never disposed.

## needle-di 1.2.1

- No startup hook, no disposal. `dist/container.js` has `unbind` and `unbindAll`, which delete providers and cached singletons and call nothing on them. A search of the package for dispose, destroy and init finds nothing. The docs (https://needle-di.io/llms-full.txt) mention only "To clear a binding, you can use the `.unbind()` or `.unbindAll()` method."

## TypeDI 0.10.0

- Startup hook. None. The `eager` service option builds the instance at registration (`container-instance.class.js`), which calls no hook.
- Container disposal. None. `ContainerInstance.reset()` and `remove()` call `destroyServiceInstance`, which calls the instance's `destroy()` method, does not await it and ignores the return value. The source comment says so: "If it contains a callable function named `destroy` it is called but not awaited and the return value is ignored." The package has no `Symbol.dispose`.
- Order. `reset()` walks `this.services` in registration order.
- Failures. `try { ...destroy() } catch (error) {}`: "We simply ignore the errors from the destroy function." An async rejection is unobserved.
- Ownership. `destroyServiceInstance` acts only when the service has a `type` or `factory` ("We reset value only if we can re-create it"), so class and factory results get `destroy()` and a plain value does not. TypeDI has no scope that tracks transients. The last release is 0.10.0 (2021-01-15, https://www.npmjs.com/package/typedi, already cited in comparison.mdx).

## NestJS @nestjs/core 12.1.2

- Startup hook. `onModuleInit` and `onApplicationBootstrap`. `hooks/on-module-init.hook.js` wraps each call in `async` and awaits `Promise.all` per level. `nest-application-context.js` `callInitHook` awaits each module in turn, ordered by `distance` descending (`getModulesToTriggerHooksOn`), so imported modules go first. Inside a module, providers are grouped by `hierarchyLevel` (set to dependency depth + 1 in `injector.js`) and levels run ascending. Providers in one level run together. A rejection fails `app.init()`. Docs: https://docs.nestjs.com/fundamentals/lifecycle-events ("Nest calls `onModuleInit()` and `onApplicationBootstrap()` module by module, ordered by each module's distance from the root module in the import graph", "Each module's hooks are awaited before Nest moves on to the next module.").
- Container disposal. `app.close()` runs `shutdown()`: `onModuleDestroy`, then `beforeApplicationShutdown`, then `dispose()` (a no-op on a bare application context, the HTTP adapter closes here), then `onApplicationShutdown` (`runShutdownSequence`). Signals need `app.enableShutdownHooks()`. There is no `Symbol.dispose` or `Symbol.asyncDispose` in the package. Repeated calls share one promise (`shutdownPromise ??=`).
- Order. `callDestroyHook` reverses the module order. Inside a module, `getSortedHierarchyLevels(..., 'DESC')` runs the deepest dependents first. Docs: "The shutdown hooks run in the reverse order" of initialization. Providers in one level run together.
- Failures. `on-module-destroy.hook.js` and `on-app-shutdown.hook.js` use `Promise.allSettled` and `Logger.error` each rejection, then continue. The errors are logged, and `close()` does not reject with them. An `onModuleInit` failure is different: `Promise.all` rejects with the first error.
- Ownership. `getInstancesGroupedByHierarchyLevel` collects every static provider instance, so hooks run on `useValue` objects (`module.js` `addCustomValue` sets `instance`) and on factory results. Static transients are included through `getStaticTransientInstances()`. It skips any wrapper where `isDependencyTreeStatic()` is false, so request-scoped providers get no hooks. Nest has no scope object that owns request-scoped instances.

## Gaps

None of the 63 cells (9 rows x 7 containers) rests on a guess. Where an official docs page was unreachable, the cell is backed by the source alone: inversify (docs pages for lifecycle returned 404, and the npm page for plugin-dispose returned 403, so the plugin cells use its published README and code), TypeDI (no docs site read) and tsyringe's lack of an init hook (absence in source and README).
