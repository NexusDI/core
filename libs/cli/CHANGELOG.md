## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### 💅 Refactors

- **cli:** export the option definitions the parser reads ([c62f22c72](https://github.com/NexusDI/core/commit/c62f22c72))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- **devtools,cli:** check provider notes when parsing a graph ([b303ef77](https://github.com/NexusDI/core/commit/b303ef77))
- **devtools,cli:** move the graph schema into devtools and classify errors by brand ([9c352d19](https://github.com/NexusDI/core/commit/9c352d19))
- **cli:** add the nexusdi graph bin for javascript and json entries ([1f378a15](https://github.com/NexusDI/core/commit/1f378a15))
- **cli:** render each format and write it to a file or stdout ([c82b1d9d](https://github.com/NexusDI/core/commit/c82b1d9d))
- **cli:** check json graphs and pick the entry's export ([5ff92127](https://github.com/NexusDI/core/commit/5ff92127))
- **cli:** parse the graph command, its flags and entry references ([2a646dd2](https://github.com/NexusDI/core/commit/2a646dd2))
- **cli:** scaffold the @nexusdi/cli package ([59bc0bc9](https://github.com/NexusDI/core/commit/59bc0bc9))

### 🩹 Fixes

- **cli:** check for @nexusdi/core before loading the graph module ([e7f10b2b](https://github.com/NexusDI/core/commit/e7f10b2b))
- **cli:** compare --out by inode and report every broken png peer at once ([7648b2b2](https://github.com/NexusDI/core/commit/7648b2b2))
- **cli:** report png peers together, guard --out, keep # inside entry paths ([c3629ee8](https://github.com/NexusDI/core/commit/c3629ee8))
- **cli:** exit 0 when the reader closes stdout early ([97867701](https://github.com/NexusDI/core/commit/97867701))
- **cli:** load tsx through its esm entry so .ts entries work on node 22 ([25ed6ee9](https://github.com/NexusDI/core/commit/25ed6ee9))
- **cli:** keep fallow from resolving the spawned bin path before a build ([4e6250b4](https://github.com/NexusDI/core/commit/4e6250b4))
- **cli:** report core input errors, name the flag in fix lines, clean test dirs ([9c4ce073](https://github.com/NexusDI/core/commit/9c4ce073))
- **cli:** declare the build target nx cannot infer ([71024e30](https://github.com/NexusDI/core/commit/71024e30))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion