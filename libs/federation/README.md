# @nexusdi/federation

[![npm](https://img.shields.io/npm/v/@nexusdi/federation/next)](https://www.npmjs.com/package/@nexusdi/federation)
[![license](https://img.shields.io/npm/l/@nexusdi/federation)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Share dependency tokens across micro-frontend shells and remotes.**

In a micro-frontend architecture, a "Shell" and its "Remotes" are often bundled separately. This typically means they each have their own copy of shared libraries, which leads to duplicate singleton instances (e.g., two different Auth services).

`@nexusdi/federation` solves this by introducing **Versioned Contracts**. It allows different bundles to share a single provider for a token, provided they agree on the contract version.

You define a contract with `defineContract({ key, version })` where you would otherwise create a standard `Token`, and `contract.token<T>(name)` makes keyed, versioned tokens. The `federation()` plugin ensures that every copy of a contract token across different bundles resolves to the same provider in the container.

## Version Safety

Federation checks every shared token's version. NexusDI follows npm's `^` range rules for contract versions:

- A remote built against version `1.1.0` can safely bind to a shell providing `1.2.0`.
- A remote requiring `2.0.0` will fail to bind to a shell providing `1.0.0`, preventing runtime crashes due to breaking API changes.

```ts @import.meta.vitest
import { Nexus, defineModule, provide } from '@nexusdi/core';
import type { BlueprintError } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IAuth {
  user(): string;
}
const shell = defineContract({ key: 'crew', version: '2.3.0' });
const newer = defineContract({ key: 'crew', version: '2.4.0' });
class Transfers {
  static deps = [newer.token<IAuth>('Auth')] as const;
  constructor(readonly auth: IAuth) {}
}
const Shell = defineModule({
  name: 'Shell',
  providers: [
    provide(shell.token<IAuth>('Auth'), { useValue: { user: () => 'ada' } }),
    Transfers,
  ],
});
const plugins = [federation()];
const listed = (error: BlueprintError) => error.errors;
const errors = await Nexus.create(Shell, { plugins }).then(() => [], listed);
errors.map((error) => ({ ...error })); // -> [{ contract: 'crew/Auth', required: '2.4.0', provided: '2.3.0' }]
```

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

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/federation/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
