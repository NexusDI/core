## 0.4.0-rc.1

### 🩹 Fixes

- **repo:** pin readme images and examples links to the release tag ([ecaf3cb95](https://github.com/NexusDI/core/commit/ecaf3cb95))
- **repo:** publish a staged copy with no source condition, and map dist to src ([7f9e9b0e1](https://github.com/NexusDI/core/commit/7f9e9b0e1))

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion

## 0.4.0-rc.0

### 🚀 Features

- ⚠️  **federation:** move `NEXUS_CONTRACT_VERSION`'s text to @nexusdi/federation/text ([918eb784](https://github.com/NexusDI/core/commit/918eb784))
- **core:** the provider and edge views hold the token as written ([2e34feef](https://github.com/NexusDI/core/commit/2e34feef))
- **federation:** keyed, versioned contract tokens ([a5dc81f4](https://github.com/NexusDI/core/commit/a5dc81f4))

### 🩹 Fixes

- **federation:** name a newer patch of the needed minor in the 0.x fix line ([444c2f7d](https://github.com/NexusDI/core/commit/444c2f7d))
- **federation:** check the patch when a contract's minors match ([56369bfb](https://github.com/NexusDI/core/commit/56369bfb))
- **federation:** require the same minor for a contract at major 0 ([3b6201f0](https://github.com/NexusDI/core/commit/3b6201f0))
- **federation:** compare the contract versions each side wrote ([2be0826c](https://github.com/NexusDI/core/commit/2be0826c))

### ⚠️  Breaking Changes

- **federation:** move `NEXUS_CONTRACT_VERSION`'s text to @nexusdi/federation/text  ([918eb784](https://github.com/NexusDI/core/commit/918eb784))
  NEXUS_CONTRACT_VERSION carries a one-line message unless
  federationText is registered. Federation is new in 0.4, so no released
  version changes.

### ❤️ Thank You

- Claude Opus 5.5 (1M context)
- Mikael Pettersson @Evanion