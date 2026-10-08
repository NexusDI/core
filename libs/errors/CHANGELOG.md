## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- ⚠️  **errors:** take text packs through errors({ text }) and explain(error, { view, text }) ([501e5a24](https://github.com/NexusDI/core/commit/501e5a24))
- **core:** name a second copy of core in the errors that reject its values ([3f2d97d1](https://github.com/NexusDI/core/commit/3f2d97d1))
- **core:** eager: false builds a sync provider at its first get() ([71bea303](https://github.com/NexusDI/core/commit/71bea303))
- **core:** scope.extend() re-pins a scope after load() ([36593fe4](https://github.com/NexusDI/core/commit/36593fe4))
- ⚠️  **core:** forroot and forrootasync replace with() ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
- ⚠️  **decorators:** move the decorators into @nexusdi/decorators ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
- ⚠️  **node:** move the ambient scope into @nexusdi/node ([7d27f940](https://github.com/NexusDI/core/commit/7d27f940))
- ⚠️  **testing:** move the testing container onto compile hooks ([7835c64e](https://github.com/NexusDI/core/commit/7835c64e))
- **errors:** move message text and near misses into @nexusdi/errors ([a094de2d](https://github.com/NexusDI/core/commit/a094de2d))

### 🩹 Fixes

- **testing:** keep revision 1 text for invalid modules, anonymous classes and bad overrides ([2ff3a31d](https://github.com/NexusDI/core/commit/2ff3a31d))

### 💅 Refactors

- **errors:** read the missing-provider lookup type from core ([e30f90c0](https://github.com/NexusDI/core/commit/e30f90c0))
- **errors:** format core's codes with @nexusdi/core/text ([afe6ce04](https://github.com/NexusDI/core/commit/afe6ce04))

### ⚠️  Breaking Changes

- **errors:** take text packs through errors({ text }) and explain(error, { view, text })  ([501e5a24](https://github.com/NexusDI/core/commit/501e5a24))
  explain(error, view) becomes explain(error, { view, text }).
  This changes unreleased API (spec section 7).
- **core:** forroot and forrootasync replace with()  ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
  Mod.with(value) is Mod.forRoot(value), and
  Mod.with({ deps, useFactory }) is Mod.forRootAsync({ useFactory, deps }).
- **decorators:** move the decorators into @nexusdi/decorators  ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
  import Injectable, Inject and Module from
  @nexusdi/decorators. Core writes class metadata through declareClass,
  declareProperty and declareModuleClass.
- **node:** move the ambient scope into @nexusdi/node  ([7d27f940](https://github.com/NexusDI/core/commit/7d27f940))
  runInScope, currentScope, the scopeContext option and
  NEXUS_NO_SCOPE_CONTEXT leave core. Use nodeScopes() from @nexusdi/node.
- **testing:** move the testing container onto compile hooks  ([7835c64e](https://github.com/NexusDI/core/commit/7835c64e))
  import createTestingContainer from @nexusdi/testing. @nexusdi/core/testing is gone.

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Claude Sonnet 5
- Mikael Pettersson @Evanion