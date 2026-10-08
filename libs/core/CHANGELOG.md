## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### 🔥 Performance

- **core:** build rewritten provider records with the shared record builder ([5827dd215](https://github.com/NexusDI/core/commit/5827dd215))
- **core:** build provider records as one literal and drop the compile rank maps ([baf9e0921](https://github.com/NexusDI/core/commit/baf9e0921))
- **core:** read class metadata once and build provider errors on failure only ([6a0798d23](https://github.com/NexusDI/core/commit/6a0798d23))
- **core:** solve module visibility sparsely ([8d6d7c723](https://github.com/NexusDI/core/commit/8d6d7c723))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- **core:** let plugins publish trace events through `PluginContext.emit` ([f0cb6126](https://github.com/NexusDI/core/commit/f0cb6126))
- **core:** publish core's error text at @nexusdi/core/text ([71095cb9](https://github.com/NexusDI/core/commit/71095cb9))
- **core:** let a plugin format an error through `PluginContext.format` ([b2dc4d2c](https://github.com/NexusDI/core/commit/b2dc4d2c))
- **core:** let `errorBase` take the docs base url a message links to ([259c23eb](https://github.com/NexusDI/core/commit/259c23eb))
- **core:** add the `ErrorTextPack` and `ErrorTextKit` contract types ([ab47f296](https://github.com/NexusDI/core/commit/ab47f296))
- **core:** make `NexusErrorCode` every key of `NexusErrorByCode` ([bec466fc](https://github.com/NexusDI/core/commit/bec466fc))
- **core:** hand construct the provider views the compile check saw ([df4a6807](https://github.com/NexusDI/core/commit/df4a6807))
- **core:** export `displayName`, `describeValue` and `isForeign` for plugins ([4fec228e](https://github.com/NexusDI/core/commit/4fec228e))
- **benchmarks:** time cold builds in interleaved rounds ([17fb547b](https://github.com/NexusDI/core/commit/17fb547b))
- **core:** pass the building container to the construct hook ([ed02bf2e](https://github.com/NexusDI/core/commit/ed02bf2e))
- **core:** the provider and edge views hold the token as written ([2e34feef](https://github.com/NexusDI/core/commit/2e34feef))
- **core:** canonical() on the compile context and the blueprint view ([383a3182](https://github.com/NexusDI/core/commit/383a3182))
- **federation:** keyed, versioned contract tokens ([a5dc81f4](https://github.com/NexusDI/core/commit/a5dc81f4))
- **core:** the token key hook keys contract tokens across copies ([4fd87ad0](https://github.com/NexusDI/core/commit/4fd87ad0))
- **core:** name a second copy of core in the errors that reject its values ([3f2d97d1](https://github.com/NexusDI/core/commit/3f2d97d1))
- **core:** eager: false builds a sync provider at its first get() ([71bea303](https://github.com/NexusDI/core/commit/71bea303))
- **core:** scope.extend() re-pins a scope after load() ([36593fe4](https://github.com/NexusDI/core/commit/36593fe4))
- ⚠️  **core:** forroot and forrootasync replace with() ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
- **core:** Nexus.create takes a provider list or a root object ([58aa67a1](https://github.com/NexusDI/core/commit/58aa67a1))
- ⚠️  **decorators:** move the decorators into @nexusdi/decorators ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
- ⚠️  **devtools:** move graph() and the trace into @nexusdi/devtools ([ba8fa13c](https://github.com/NexusDI/core/commit/ba8fa13c))
- ⚠️  **node:** move the ambient scope into @nexusdi/node ([7d27f940](https://github.com/NexusDI/core/commit/7d27f940))
- **core:** let a compile.provider rewrite label its error site ([5a8f2705](https://github.com/NexusDI/core/commit/5a8f2705))
- ⚠️  **testing:** move the testing container onto compile hooks ([7835c64e](https://github.com/NexusDI/core/commit/7835c64e))
- **errors:** move message text and near misses into @nexusdi/errors ([a094de2d](https://github.com/NexusDI/core/commit/a094de2d))
- **core:** nexus.check compiles a graph without building it ([180e95a5](https://github.com/NexusDI/core/commit/180e95a5))
- ⚠️  **core:** thin error classes with one-line messages and a format error hook ([3aca9760](https://github.com/NexusDI/core/commit/3aca9760))
- **core:** construct, observe, setup, dispose and modules hooks ([8f48b501](https://github.com/NexusDI/core/commit/8f48b501))
- **core:** compile hooks and read-only blueprint views ([eb98640d](https://github.com/NexusDI/core/commit/eb98640d))
- **core:** register and validate plugins at create ([491a5756](https://github.com/NexusDI/core/commit/491a5756))
- **core:** add the standard @injectable, @inject and @module decorators ([efccb0b6](https://github.com/NexusDI/core/commit/efccb0b6))
- **core:** add createtestingcontainer with provider and module overrides ([fe6c9eae](https://github.com/NexusDI/core/commit/fe6c9eae))
- **core:** emit compile and untracked trace events ([10a0697b](https://github.com/NexusDI/core/commit/10a0697b))
- **core:** expose the compiled graph as plain json ([df512288](https://github.com/NexusDI/core/commit/df512288))
- **core:** abort in-flight load and createscope when disposal starts ([73a85d27](https://github.com/NexusDI/core/commit/73a85d27))
- **core:** dispose the container and its scopes in reverse creation order ([431e0dee](https://github.com/NexusDI/core/commit/431e0dee))
- **core:** run oninit level by level after the singletons are built ([7d00421f](https://github.com/NexusDI/core/commit/7d00421f))
- **core:** add resolve and validate for deps maps ([b52e7b68](https://github.com/NexusDI/core/commit/b52e7b68))
- **core:** add runinscope and currentscope over a scopecontext ([2df02ad4](https://github.com/NexusDI/core/commit/2df02ad4))
- **core:** add scopes with request and per-scope lifetimes ([4da7c5a6](https://github.com/NexusDI/core/commit/4da7c5a6))
- **core:** load modules after startup against the live graph ([2d72a62b](https://github.com/NexusDI/core/commit/2d72a62b))
- **core:** check readiness in lazy thunks and report nexus_not_ready ([940d048b](https://github.com/NexusDI/core/commit/940d048b))
- **core:** clean up failed startups and validate module options ([0f858ead](https://github.com/NexusDI/core/commit/0f858ead))
- **core:** build singletons level by level and resolve get() synchronously ([9ab5eac1](https://github.com/NexusDI/core/commit/9ab5eac1))
- **core:** add the runtime slots, construction stack, ownership, disposal and tracer ([b2e689a9](https://github.com/NexusDI/core/commit/b2e689a9))
- **core:** read static deps, and declared deps through use-class ([ae9d41e0](https://github.com/NexusDI/core/commit/ae9d41e0))
- **core:** accept object-literal providers and default factory deps to [] ([33b4ac5e](https://github.com/NexusDI/core/commit/33b4ac5e))
- **core:** compute build levels and request dependents in pass 6 ([2faedc2b](https://github.com/NexusDI/core/commit/2faedc2b))
- **core:** reject singletons that capture scoped providers in pass 5 ([03696f67](https://github.com/NexusDI/core/commit/03696f67))
- **core:** report dependency cycles with their full path in pass 4 ([67cd8e20](https://github.com/NexusDI/core/commit/67cd8e20))
- **core:** bind deps and report missing providers with near misses in pass 3 ([885704b7](https://github.com/NexusDI/core/commit/885704b7))
- **core:** compute module visibility and exports in compile() pass 2 ([f20ab65d](https://github.com/NexusDI/core/commit/f20ab65d))
- **core:** walk the module graph in compile() pass 1 ([89300ccc](https://github.com/NexusDI/core/commit/89300ccc))
- **core:** validate provider entries into blueprint records ([de5f7c41](https://github.com/NexusDI/core/commit/de5f7c41))
- **core:** read and write injection metadata on symbol.metadata ([2c042b6a](https://github.com/NexusDI/core/commit/2c042b6a))
- **core:** add module definitions, with() and the request token ([fd136c2c](https://github.com/NexusDI/core/commit/fd136c2c))
- **core:** add provide() with deps checked against the constructor ([b1f8ef47](https://github.com/NexusDI/core/commit/b1f8ef47))
- **core:** add the optional, lazy and all dependency modifiers ([f91b3b63](https://github.com/NexusDI/core/commit/f91b3b63))
- **core:** add the token and multi-token types ([d2858eb6](https://github.com/NexusDI/core/commit/d2858eb6))
- **core:** add the error catalogue ([506af53b](https://github.com/NexusDI/core/commit/506af53b))
- ⚠️  **core:** remove the 0.3 engine and scaffold the 0.4 package ([90100be8](https://github.com/NexusDI/core/commit/90100be8))

### 🩹 Fixes

- **core:** keep a frozen `BlueprintError` a check reports ([0d7c74a9](https://github.com/NexusDI/core/commit/0d7c74a9))
- **core:** keep the error when its near misses or message are locked ([cf435728](https://github.com/NexusDI/core/commit/cf435728))
- **core:** write near misses back to any error that has the field ([015fb9ec](https://github.com/NexusDI/core/commit/015fb9ec))
- **core:** check the off bundle for every hook site condition and fold the negated guards ([db382419](https://github.com/NexusDI/core/commit/db382419))
- **bench-kit:** pass the dispatch verdict on the median and share one batch per pair ([8463a74a](https://github.com/NexusDI/core/commit/8463a74a))
- **bench-kit:** resample whole worker pairs for the dispatch interval ([216b07c2](https://github.com/NexusDI/core/commit/216b07c2))
- **core:** set the scope's extend queue before its build starts ([2ecaac7b](https://github.com/NexusDI/core/commit/2ecaac7b))
- **core:** make a scope disposal from a construct hook wait for the scope build ([fe6d3511](https://github.com/NexusDI/core/commit/fe6d3511))
- **core:** export the uninferred root type so a wrapper of check keeps its generic ([569f790f](https://github.com/NexusDI/core/commit/569f790f))
- **core:** treat a rewrite label of undefined as absent ([cd62c8d3](https://github.com/NexusDI/core/commit/cd62c8d3))
- **core:** reject a plugin whose compile hook object is an array ([e88de855](https://github.com/NexusDI/core/commit/e88de855))
- **core:** count a brand another copy wrote whatever its value ([4e1bad87](https://github.com/NexusDI/core/commit/4e1bad87))
- **core:** keep a deferred singleton deferred across later loads ([520f5dbf](https://github.com/NexusDI/core/commit/520f5dbf))
- **core:** build a levelled eager: false provider only in its level ([12bd5d7f](https://github.com/NexusDI/core/commit/12bd5d7f))
- **core:** tie on-demand builds to the running create, load or extend ([198e32ac](https://github.com/NexusDI/core/commit/198e32ac))
- **core:** check a root per element through one generic signature ([319e074e](https://github.com/NexusDI/core/commit/319e074e))
- **decorators:** run r20 on the decorators in a browser and export ctor ([982e80e5](https://github.com/NexusDI/core/commit/982e80e5))
- **devtools:** give graph() errors full text and add a devtools security register ([d2f71fdb](https://github.com/NexusDI/core/commit/d2f71fdb))
- **core:** select the replacing module for the module option under a module override ([1d472ec6](https://github.com/NexusDI/core/commit/1d472ec6))
- **core:** leave nexus errors thrown by user code unformatted ([45dcc07a](https://github.com/NexusDI/core/commit/45dcc07a))
- **core:** keep raiser-owned error text and format registration errors ([afccd63d](https://github.com/NexusDI/core/commit/afccd63d))
- **core:** dispose failed construct results and plugins started before a failed setup ([2795b520](https://github.com/NexusDI/core/commit/2795b520))
- **core:** run compile hooks inside the compile and skip hook work without plugins ([6a57e28a](https://github.com/NexusDI/core/commit/6a57e28a))
- **core:** give each provider form a missing-deps fix it reads ([a245eaca](https://github.com/NexusDI/core/commit/a245eaca))
- **core:** return a thenable transient class instance as constructed ([3d5dc664](https://github.com/NexusDI/core/commit/3d5dc664))
- **core:** type override() class deps the way provide() does ([166bc26a](https://github.com/NexusDI/core/commit/166bc26a))
- **core:** name the module and provider index in a compile-time invalid token ([7e3d709a](https://github.com/NexusDI/core/commit/7e3d709a))
- **core:** read injectable options and module configs as own properties ([096c00d0](https://github.com/NexusDI/core/commit/096c00d0))
- **core:** settle visibility per strongly connected component ([97c93650](https://github.com/NexusDI/core/commit/97c93650))
- **core:** stop exported() memoising a result a cycle cut cut short ([45f99025](https://github.com/NexusDI/core/commit/45f99025))
- **core:** read provider options as own properties and dedupe repeated entries ([231eff66](https://github.com/NexusDI/core/commit/231eff66))
- **core:** collect trace callback throws during disposal ([fcda32e0](https://github.com/NexusDI/core/commit/fcda32e0))
- **core:** wrap a user-thrown disposed error when the root is open ([1e86de2a](https://github.com/NexusDI/core/commit/1e86de2a))
- **core:** clear a failed load's async flags on rollback ([becd92bd](https://github.com/NexusDI/core/commit/becd92bd))
- **core:** chain an aborted load or createscope's rollback disposer errors into container disposal ([60d6b46a](https://github.com/NexusDI/core/commit/60d6b46a))
- **core:** await a closing scope from root disposal and disposal trace throws ([3d738986](https://github.com/NexusDI/core/commit/3d738986))
- **core:** attach deps entry at any depth and stop invalid-token double-printing the value ([ea84e2c4](https://github.com/NexusDI/core/commit/ea84e2c4))
- **core:** stop a scoped factory building twice through a lazy thunk ([4b6962f0](https://github.com/NexusDI/core/commit/4b6962f0))
- **core:** scope load()'s ownership rollback and global check to fit review ([b4955f85](https://github.com/NexusDI/core/commit/b4955f85))
- **core:** box the options validation result so it is never adopted ([13b8957a](https://github.com/NexusDI/core/commit/13b8957a))
- **core:** type factory params from deps when a class is its own token ([14876e0d](https://github.com/NexusDI/core/commit/14876e0d))
- **core:** await a singleton's thenable only when its provider is a factory ([71a0a49b](https://github.com/NexusDI/core/commit/71a0a49b))
- **core:** stop provide() and token literals reading @injectable deps ([675b7036](https://github.com/NexusDI/core/commit/675b7036))
- **core:** check declared deps for every static-deps class form ([c2e1419e](https://github.com/NexusDI/core/commit/c2e1419e))
- **core:** dedupe the scoped-reachability walk to avoid exponential blowup ([ce3ae95e](https://github.com/NexusDI/core/commit/ce3ae95e))
- **core:** make the lifetime check's scoped-path walk iterative ([eac954fe](https://github.com/NexusDI/core/commit/eac954fe))
- **core:** derive walk's node draft type to clear a fallow dupe ([12ab7612](https://github.com/NexusDI/core/commit/12ab7612))
- **core:** build with() from the base definition, not the live config ([aab5589b](https://github.com/NexusDI/core/commit/aab5589b))

### 🔥 Performance

- **core:** skip the tracer and construct hooks on a transient build with no plugin needing them ([c29043fc](https://github.com/NexusDI/core/commit/c29043fc))
- **core:** drop the root getter and keep trace emit inlinable ([58eb1144](https://github.com/NexusDI/core/commit/58eb1144))
- **core:** guard every plugin hook site with a build-time constant ([f06124c1](https://github.com/NexusDI/core/commit/f06124c1))

### 💅 Refactors

- **core:** restore the construct plugin hook ([07fd827a](https://github.com/NexusDI/core/commit/07fd827a))
- **core:** defer the construct plugin hook to the interceptor release ([7f2ef48a](https://github.com/NexusDI/core/commit/7f2ef48a))
- **core:** consolidate internal assertions, plugin registration and build failures ([7b386a48](https://github.com/NexusDI/core/commit/7b386a48))
- **core:** one store path for every built instance ([af0a3e2f](https://github.com/NexusDI/core/commit/af0a3e2f))
- **core:** one level builder for create, load, scope creation and extend ([352d0d27](https://github.com/NexusDI/core/commit/352d0d27))
- **core:** resolve export plans in the walk ([e74d5120](https://github.com/NexusDI/core/commit/e74d5120))
- **core:** replace non-null assertions and lint with zero warnings ([a4db71c0](https://github.com/NexusDI/core/commit/a4db71c0))

### ⚠️  Breaking Changes

- **core:** forroot and forrootasync replace with()  ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
  Mod.with(value) is Mod.forRoot(value), and
  Mod.with({ deps, useFactory }) is Mod.forRootAsync({ useFactory, deps }).
- **decorators:** move the decorators into @nexusdi/decorators  ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
  import Injectable, Inject and Module from
  @nexusdi/decorators. Core writes class metadata through declareClass,
  declareProperty and declareModuleClass.
- **devtools:** move graph() and the trace into @nexusdi/devtools  ([ba8fa13c](https://github.com/NexusDI/core/commit/ba8fa13c))
  ship.graph() and the trace option of Nexus.create leave
  core. Use graph(ship) with devtools(), and trace(fn), from
  @nexusdi/devtools.
- **node:** move the ambient scope into @nexusdi/node  ([7d27f940](https://github.com/NexusDI/core/commit/7d27f940))
  runInScope, currentScope, the scopeContext option and
  NEXUS_NO_SCOPE_CONTEXT leave core. Use nodeScopes() from @nexusdi/node.
- **testing:** move the testing container onto compile hooks  ([7835c64e](https://github.com/NexusDI/core/commit/7835c64e))
  import createTestingContainer from @nexusdi/testing. @nexusdi/core/testing is gone.
- **core:** thin error classes with one-line messages and a format error hook  ([3aca9760](https://github.com/NexusDI/core/commit/3aca9760))
  core error messages are one line with the code, the
  fields and a docs link. Register a formatError plugin for full text.
  InvalidProviderError.reason and InvalidTokenError.reason are ids with a
  detail field.
- **core:** remove the 0.3 engine and scaffold the 0.4 package  ([90100be8](https://github.com/NexusDI/core/commit/90100be8))
  @nexusdi/core 0.4 is a rewrite. Migrate with @nexusdi/codemod
  and the 0.3 to 0.4 guide.

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Claude Sonnet 5
- Mikael Pettersson @Evanion

## 0.3.2

### 🚀 Features

- **repo:** port readme doctests from the libraries repo ([f88e0fe](https://github.com/NexusDI/core/commit/f88e0fe))

### 🩹 Fixes

- **core:** recognise tokens after bundler class renaming ([e1d3ed3](https://github.com/NexusDI/core/commit/e1d3ed3))
- **core:** keep the symbol.metadata polyfill under bundler tree-shaking ([610f7bb](https://github.com/NexusDI/core/commit/610f7bb))
- **core:** add the tsconfig project reference nx sync wants for doc-examples ([c492743](https://github.com/NexusDI/core/commit/c492743))
- **core:** remove the unused tslib dependency ([be440cf](https://github.com/NexusDI/core/commit/be440cf))
- **core:** follow the libs/urn package.json template ([7f754a6](https://github.com/NexusDI/core/commit/7f754a6))
- **core:** pin the vitest tsconfig explicitly for Vite 8's oxc transform ([d5faf85](https://github.com/NexusDI/core/commit/d5faf85))
- **core:** emit node-resolvable ESM with explicit import extensions ([da05a1f](https://github.com/NexusDI/core/commit/da05a1f))
- **core:** remove development export condition that points at unshipped src ([579e4ff](https://github.com/NexusDI/core/commit/579e4ff))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.3.1

### 🛠️ Improvements

- **Stricter Type Checking**: Refactored core types and provider discrimination for improved type safety, better inference, and more robust error handling.
- **Provider Discrimination**: Enhanced internal logic to more clearly distinguish between class, value, and factory providers.
- **Codebase Cleanup**: Removed unused types, guards, and helpers for a leaner, more maintainable codebase.

### 🗑️ Removed

- **Source Maps**: Disabled all source map and declaration map generation for published npm packages, resulting in smaller and cleaner builds.

## 0.3.0

### 🚀 Features & Improvements

- **Native Decorator Metadata**: Migrated from `reflect-metadata` to the new ECMAScript/TypeScript standard using `Symbol.metadata`. No need to install or import `reflect-metadata` for NexusDI v0.3+.
- **Unified Module API**: Merged `services` and `providers` arrays in module definitions into a single `providers` array for simpler configuration.
- **Polyfill Included**: NexusDI now includes a built-in polyfill for `Symbol.metadata` for environments that do not support it natively.
- **Improved Type Safety**: Enhanced generics and overloads for decorators and containers.
- **Performance**: Further optimized for tree-shaking and minimal runtime overhead.

### 🛠️ Migration

- Update your `tsconfig.json`:
  - Remove `emitDecoratorMetadata`
  - Ensure `experimentalDecorators` and `useDefineForClassFields` are enabled
  - Set `"target": "ES2022"` or higher
- Remove all imports of `reflect-metadata`
- Update modules to use a single `providers` array

### ❤️ Thank You

- Mikael Pettersson @Evanion

## 0.2.1

### 🩹 Fixes

- correct outputPath for releases ([1509e84](https://github.com/NexusDI/core/commit/1509e84))

### ❤️ Thank You

- Mikael Pettersson @Evanion

## 0.2.0

- **Unify Nexus.set**: Unify the `set`, `setModule`, and `registerDynamicModule`
- **DynamicModules**: Add support for DynamicModules.
- **NX**: moved codebase over to NX monorepo
- **Better overloads**: Better decorator and container overloads for usabillity.

## 0.1.0

- **Core DI Container**: `Nexus` class with full dependency injection capabilities
- **Decorator System**: `@Service`, `@Inject`, `@Module`, `@Provider`, `@Injectable`, `@Optional` decorators
- **Token System**: Type-safe `Token` class for dependency identification
- **Provider Patterns**: Support for `useClass`, `useValue`, and `useFactory` providers
- **Module System**: Module registration with imports, services, and providers
- **Dynamic Modules**: `DynamicModule` base class with `config()` and `configAsync()` methods
- **Child Containers**: Container inheritance and override capabilities
- **Property Injection**: Support for injecting dependencies into class properties
- **Constructor Injection**: Automatic dependency resolution for constructor parameters
- **Alias System**: Token aliasing for flexible dependency mapping
- **Singleton Management**: Automatic singleton instance management
- **TypeScript Support**: Full TypeScript integration with generics and type safety
- **Comprehensive Examples**: Basic usage, advanced usage, and dynamic modules examples
- **React Router 7 Example**: Full-stack example with SSR, testing, and e2e tests
- **Performance Benchmarks**: Comparison with InversifyJS, tsyringe, and TypeDI
- **Complete Documentation**: 16 comprehensive documentation articles
- **Test Suite**: Unit tests, integration tests, and e2e tests with high coverage
- **CI/CD Pipeline**: GitHub Actions for testing, building, and deployment
- **Modern Tooling**: Biome for linting/formatting, Vitest for testing, TypeScript 5.x
- **Package Management**: Proper npm package configuration with peer dependencies
- **API Design**: Iteratively refined from initial concept to production-ready API
- **Documentation Structure**: Organized into logical sections with cross-references
- **Code Quality**: Comprehensive linting and formatting rules
- **Performance**: Optimized for minimal runtime overhead (~96KB total bundle size)
- **Circular Dependencies**: Resolved through proper type organization
- **Type Safety**: Improved generic usage and type inference
- **Documentation**: Fixed broken links and improved navigation
- **Testing**: Resolved decorator metadata issues in test environment
- **Build Process**: Proper TypeScript compilation and distribution
- **Dependency Management**: Updated to latest stable versions
- **Code Quality**: Comprehensive linting rules for security best practices
