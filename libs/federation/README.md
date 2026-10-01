# @nexusdi/federation

[![npm](https://img.shields.io/npm/v/@nexusdi/federation/next)](https://www.npmjs.com/package/@nexusdi/federation)
[![license](https://img.shields.io/npm/l/@nexusdi/federation)](https://github.com/NexusDI/core/blob/main/LICENSE)

Share NexusDI tokens between a micro-frontend shell and its remotes through versioned contracts.

`federation()` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that binds every copy of a contract token to one provider. A shell and its remotes can each bundle the contracts package and still share one auth service.

- `defineContract({ key, version })` makes keyed, versioned tokens.
- Every bundled copy of a contract token finds one provider.
- A remote built against an older minor of the contract still binds.
- Version checks follow the rule of npm's `^` range.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/federation@next @nexusdi/core@next
```

## Usage

<!-- #region shared-token -->

```ts @import.meta.vitest
import { Nexus, defineModule, provide, type Token } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface IAuth {
  user(): string;
}
class CrewAuth implements IAuth {
  user = () => 'ada';
}
const shellBank = defineContract({ key: 'crew', version: '2.3.0' });
const remoteBank = defineContract({ key: 'crew', version: '2.1.0' });
const AUTH: Token<IAuth> = shellBank.token('Auth');
const Shell = defineModule({
  name: 'Shell',
  providers: [provide(AUTH, { useClass: CrewAuth })],
});
await using shell = await Nexus.create(Shell, { plugins: [federation()] });
shell.get(remoteBank.token<IAuth>('Auth')).user(); // -> 'ada'
```

<!-- #endregion shared-token -->

## Version checks

<!-- #region version-check -->

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

<!-- #endregion version-check -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/federation/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
