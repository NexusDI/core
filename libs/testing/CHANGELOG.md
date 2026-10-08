## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- **testing:** match overrides and stub exports by token key ([3db0515b](https://github.com/NexusDI/core/commit/3db0515b))
- **core:** name a second copy of core in the errors that reject its values ([3f2d97d1](https://github.com/NexusDI/core/commit/3f2d97d1))
- ⚠️  **core:** forroot and forrootasync replace with() ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
- ⚠️  **decorators:** move the decorators into @nexusdi/decorators ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
- ⚠️  **testing:** move the testing container onto compile hooks ([7835c64e](https://github.com/NexusDI/core/commit/7835c64e))

### 🩹 Fixes

- **core:** count a brand another copy wrote whatever its value ([4e1bad87](https://github.com/NexusDI/core/commit/4e1bad87))
- **testing:** keep revision 1 text for invalid modules, anonymous classes and bad overrides ([2ff3a31d](https://github.com/NexusDI/core/commit/2ff3a31d))

### 💅 Refactors

- **testing:** name values and tokens with core's helpers ([6fa0facd](https://github.com/NexusDI/core/commit/6fa0facd))

### ⚠️  Breaking Changes

- **core:** forroot and forrootasync replace with()  ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
  Mod.with(value) is Mod.forRoot(value), and
  Mod.with({ deps, useFactory }) is Mod.forRootAsync({ useFactory, deps }).
- **decorators:** move the decorators into @nexusdi/decorators  ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
  import Injectable, Inject and Module from
  @nexusdi/decorators. Core writes class metadata through declareClass,
  declareProperty and declareModuleClass.
- **testing:** move the testing container onto compile hooks  ([7835c64e](https://github.com/NexusDI/core/commit/7835c64e))
  import createTestingContainer from @nexusdi/testing. @nexusdi/core/testing is gone.

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion