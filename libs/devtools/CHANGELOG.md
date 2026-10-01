## 0.4.0-rc.0

### 🚀 Features

- **devtools,cli:** check provider notes when parsing a graph ([b303ef77](https://github.com/NexusDI/core/commit/b303ef77))
- **devtools,cli:** move the graph schema into devtools and classify errors by brand ([9c352d19](https://github.com/NexusDI/core/commit/9c352d19))
- **devtools:** render the graph as a mermaid flowchart ([6507a8cd](https://github.com/NexusDI/core/commit/6507a8cd))
- **devtools:** render the graph as graphviz dot ([d3950f9b](https://github.com/NexusDI/core/commit/d3950f9b))
- **devtools:** name the bound class of each class provider in the graph ([d7ea3308](https://github.com/NexusDI/core/commit/d7ea3308))
- **devtools:** let plugins annotate graph providers with notes ([ae3a015a](https://github.com/NexusDI/core/commit/ae3a015a))
- **devtools:** format with the caller's text packs and let their plugins go first ([40ea9d31](https://github.com/NexusDI/core/commit/40ea9d31))
- **devtools:** re-export `TraceEventByType` ([5ca563a3](https://github.com/NexusDI/core/commit/5ca563a3))
- ⚠️  **decorators:** move the decorators into @nexusdi/decorators ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
- ⚠️  **devtools:** move graph() and the trace into @nexusdi/devtools ([ba8fa13c](https://github.com/NexusDI/core/commit/ba8fa13c))

### 🩹 Fixes

- **cli:** check for @nexusdi/core before loading the graph module ([e7f10b2b](https://github.com/NexusDI/core/commit/e7f10b2b))
- **cli:** compare --out by inode and report every broken png peer at once ([7648b2b2](https://github.com/NexusDI/core/commit/7648b2b2))
- **devtools:** encode backticks in mermaid labels and hide an unused request provider ([7a336eaa](https://github.com/NexusDI/core/commit/7a336eaa))
- **devtools:** let inspect take every root form nexus check takes ([99069686](https://github.com/NexusDI/core/commit/99069686))
- **devtools:** give graph() errors full text and add a devtools security register ([d2f71fdb](https://github.com/NexusDI/core/commit/d2f71fdb))

### 💅 Refactors

- **devtools:** call explain with its options object ([1da57305](https://github.com/NexusDI/core/commit/1da57305))

### ⚠️  Breaking Changes

- **decorators:** move the decorators into @nexusdi/decorators  ([6268583e](https://github.com/NexusDI/core/commit/6268583e))
  import Injectable, Inject and Module from
  @nexusdi/decorators. Core writes class metadata through declareClass,
  declareProperty and declareModuleClass.
- **devtools:** move graph() and the trace into @nexusdi/devtools  ([ba8fa13c](https://github.com/NexusDI/core/commit/ba8fa13c))
  ship.graph() and the trace option of Nexus.create leave
  core. Use graph(ship) with devtools(), and trace(fn), from
  @nexusdi/devtools.

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion