# @nexusdi/federation

[![npm](https://img.shields.io/npm/v/@nexusdi/federation/next)](https://www.npmjs.com/package/@nexusdi/federation)
[![license](https://img.shields.io/npm/l/@nexusdi/federation)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Unify dependency singleton instances across micro-frontend shells and remotes.**

Micro-frontend architectures often bundle shells and remotes separately, causing shared libraries to be duplicated. This leads to multiple instances of services that must be singletons (such as authentication or configuration providers), creating fragmented state and runtime bugs.

`@nexusdi/federation` solves this by introducing **Versioned Contracts**, allowing separate bundles to resolve the same provider if they agree on the contract version.

```ts @import.meta.vitest
import { Nexus, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IAuth {
  user(): string;
}
class CrewAuth implements IAuth {
  user = () => 'ada';
}

const authContract = defineContract({ key: 'auth', version: '1.0.0' });
const AUTH = authContract.token<IAuth>('Auth');
const Shell = defineModule({
  name: 'Shell',
  providers: [provide(AUTH, { useClass: CrewAuth })],
});

await using shell = await Nexus.create(Shell, { plugins: [federation()] });
shell.get(AUTH).user(); // -> 'ada'
```

## Key Features

**The federation plugin synchronizes tokens across bundles.** The `federation()` plugin ensures every copy of a contract token resolves to the same provider in the container.

**Version safety prevents runtime crashes.** NexusDI applies npm `^` range rules to contracts so a remote requiring `1.1.0` can bind to a shell providing `1.2.0`, while a remote requiring `2.0.0` will fail to bind to `1.0.0`.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/federation@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IAuth {
  user(): string;
}

class CrewAuth implements IAuth {
  user = () => 'ada';
}

const shellContract = defineContract({ key: 'crew', version: '1.2.0' });
const remoteContract = defineContract({ key: 'crew', version: '1.1.0' });
const AUTH = shellContract.token<IAuth>('Auth');

const Shell = defineModule({
  name: 'Shell',
  providers: [provide(AUTH, { useClass: CrewAuth })],
});
await using shell = await Nexus.create(Shell, { plugins: [federation()] });
shell.get(AUTH).user(); // -> 'ada'
// A copy of the token from a remote bundle resolves to the same provider
shell.get(remoteContract.token<IAuth>('Auth')).user(); // -> 'ada'
```

## Documentation

- [Plugins Guide](https://nexus.js.org/next/plugins/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
