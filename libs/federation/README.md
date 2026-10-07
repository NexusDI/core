# @nexusdi/federation

[![npm](https://img.shields.io/npm/v/@nexusdi/federation/next)](https://www.npmjs.com/package/@nexusdi/federation)
[![license](https://img.shields.io/npm/l/@nexusdi/federation)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Share dependency tokens across micro-frontend shells and remotes.**

In a micro-frontend architecture, a "Shell" and its "Remotes" are often bundled separately. This typically means they each have their own copy of shared libraries, which leads to duplicate singleton instances (e.g., two different Auth services).

`@nexusdi/federation` solves this by introducing **Versioned Contracts**. It allows different bundles to share a single provider for a token, provided they agree on the contract version.

## How it Works

Instead of creating a standard `Token`, you define a `Contract`. A contract has a unique key and a semantic version.

```ts
const authContract = defineContract({ key: 'auth', version: '1.0.0' });
const AUTH = authContract.token<IAuth>('Auth');
```

The `federation()` plugin ensures that every copy of this contract token across different bundles resolves to the same provider in the container.

## Version Safety

Federation isn't just about sharing; it's about safe sharing. NexusDI follows npm's `^` range rules for contract versions:

- A remote built against version `1.1.0` can safely bind to a shell providing `1.2.0`.
- A remote requiring `2.0.0` will fail to bind to a shell providing `1.0.0`, preventing runtime crashes due to breaking API changes.

## Installation

```bash
npm install @nexusdi/federation@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

const contract = defineContract({ key: 'crew', version: '1.0.0' });
const AUTH = contract.token<IAuth>('Auth');

const Shell = defineModule({
  name: 'Shell',
  providers: [provide(AUTH, { useClass: CrewAuth })],
});

await using shell = await Nexus.create(Shell, { plugins: [federation()] });
// Even if the token comes from a different bundle, it resolves to the same instance
shell.get(AUTH).user();
```

## Documentation

- [Federation Guide](https://nexus.js.org/next/federation/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
