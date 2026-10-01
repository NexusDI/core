## 0.4.0-rc.0

### 🚀 Features

- **interceptors:** move the error text into @nexusdi/interceptors/text ([ea1c0e55](https://github.com/NexusDI/core/commit/ea1c0e55))
- **interceptors:** document the package and add its security register and integration tests ([34cc9b9e](https://github.com/NexusDI/core/commit/34cc9b9e))
- **interceptors:** report missing and mis-scoped interceptors at compile ([9c3e9bb7](https://github.com/NexusDI/core/commit/9c3e9bb7))
- **interceptors:** add the interceptors() plugin with its registry and construct hook ([db94d452](https://github.com/NexusDI/core/commit/db94d452))
- **interceptors:** wrap methods in a proxy that calls the raw instance ([ebbcfdad](https://github.com/NexusDI/core/commit/ebbcfdad))
- **interceptors:** compute a method's interceptor chain ([c15e57d9](https://github.com/NexusDI/core/commit/c15e57d9))
- **interceptors:** validate interceptors() options and add interceptor() ([11ea2b53](https://github.com/NexusDI/core/commit/11ea2b53))
- **interceptors:** read static and decorator declarations ([007681e7](https://github.com/NexusDI/core/commit/007681e7))
- **interceptors:** add the interceptor contract types and tap() ([cb43e6a1](https://github.com/NexusDI/core/commit/cb43e6a1))
- **interceptors:** scaffold @nexusdi/interceptors and its error class ([f0584cdc](https://github.com/NexusDI/core/commit/f0584cdc))

### 🩹 Fixes

- **interceptors:** type a rejected interceptor() entry's provider as unset ([c1ebc2c3](https://github.com/NexusDI/core/commit/c1ebc2c3))
- **interceptors:** drop a closed session's container and the live pointer to it ([ac3af781](https://github.com/NexusDI/core/commit/ac3af781))
- **interceptors:** give a call-time fault raised before setup its own text ([c6b91537](https://github.com/NexusDI/core/commit/c6b91537))
- **interceptors:** match a load on the support skip only with global entries ([0fc3f8d7](https://github.com/NexusDI/core/commit/0fc3f8d7))
- **interceptors:** find a scope's session through its root's registry ([bb5c6d86](https://github.com/NexusDI/core/commit/bb5c6d86))
- **interceptors:** key each session by the container the construct hook names ([2a09baa7](https://github.com/NexusDI/core/commit/2a09baa7))
- **interceptors:** address the re-review of the pr 62 fixes ([7e95d228](https://github.com/NexusDI/core/commit/7e95d228))
- **interceptors:** address the final review of pr 62 ([af8dc972](https://github.com/NexusDI/core/commit/af8dc972))
- **interceptors:** keep per-container ids per session and skip global entries on interceptor deps ([37cd2e4c](https://github.com/NexusDI/core/commit/37cd2e4c))
- **interceptors:** proxy a frozen object through a shadow so its own methods can be wrapped ([f9e0a824](https://github.com/NexusDI/core/commit/f9e0a824))

### 💅 Refactors

- **interceptors:** key each compile by the provider views construct receives ([ffb6f1d1](https://github.com/NexusDI/core/commit/ffb6f1d1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion