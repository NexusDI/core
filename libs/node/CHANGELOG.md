## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- ⚠️  **node:** move the ambient scope into @nexusdi/node ([7d27f940](https://github.com/NexusDI/core/commit/7d27f940))

### ⚠️  Breaking Changes

- **node:** move the ambient scope into @nexusdi/node  ([7d27f940](https://github.com/NexusDI/core/commit/7d27f940))
  runInScope, currentScope, the scopeContext option and
  NEXUS_NO_SCOPE_CONTEXT leave core. Use nodeScopes() from @nexusdi/node.

### ❤️ Thank You

- Claude Sonnet 5
- Mikael Pettersson @Evanion