## 0.4.0-rc.2

### 🚀 Features

- **cli:** sample the cpu and merge it into the chrome trace ([f8350b4](https://github.com/NexusDI/core/commit/f8350b4))
- **devtools:** carry where a report was recorded on its header line ([e284e22](https://github.com/NexusDI/core/commit/e284e22))
- **devtools:** move live drawing to the @nexusdi/devtools/live subpath ([9fb86f6](https://github.com/NexusDI/core/commit/9fb86f6))
- **devtools:** write a perfetto trace with dependency flows ([09fcf42](https://github.com/NexusDI/core/commit/09fcf42))
- **devtools:** write a performance trace for the browser profiler and draw spans live ([5cb108a](https://github.com/NexusDI/core/commit/5cb108a))
- **devtools:** parse saved reports and profile a startup in one call ([93655b3](https://github.com/NexusDI/core/commit/93655b3))
- **devtools:** print a startup table and the critical path ([51f9a28](https://github.com/NexusDI/core/commit/51f9a28))
- **devtools:** record startup runs with profile() ([9eb1039](https://github.com/NexusDI/core/commit/9eb1039))
- **core:** state on the view which edges order a build and which providers are inline ([3e3ee67](https://github.com/NexusDI/core/commit/3e3ee67))
- **core:** close every create, load, scope creation and extend() with a run event ([7f60ac9](https://github.com/NexusDI/core/commit/7f60ac9))

### ❤️ Thank You

- Mikael Pettersson @Evanion

## 0.4.0-rc.1

### 🚀 Features

- **readme-assets:** draw the readme graph from a meridian fixture app ([b10430b49](https://github.com/NexusDI/core/commit/b10430b49))

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **devtools:** draw dot cluster labels in the node font ([30a949e37](https://github.com/NexusDI/core/commit/30a949e37))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

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