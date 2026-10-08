## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- **core:** name a second copy of core in the errors that reject its values ([3f2d97d1](https://github.com/NexusDI/core/commit/3f2d97d1))
- ⚠️  **core:** forroot and forrootasync replace with() ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
- ⚠️  **decorators:** move the decorators into @nexusdi/decorators ([6268583e](https://github.com/NexusDI/core/commit/6268583e))

### 🩹 Fixes

- **decorators:** run r20 on the decorators in a browser and export ctor ([982e80e5](https://github.com/NexusDI/core/commit/982e80e5))

### ⚠️  Breaking Changes

- **core:** forroot and forrootasync replace with()  ([f11d6381](https://github.com/NexusDI/core/commit/f11d6381))
  Mod.with(value) is Mod.forRoot(value), and
  Mod.with({ deps, useFactory }) is Mod.forRootAsync({ useFactory, deps }).
- **decorators:** move the decorators into @nexusdi/decorators  ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
  import Injectable, Inject and Module from
  @nexusdi/decorators. Core writes class metadata through declareClass,
  declareProperty and declareModuleClass.

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion