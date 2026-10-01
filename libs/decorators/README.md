# @nexusdi/decorators

[![npm](https://img.shields.io/npm/v/@nexusdi/decorators/next)](https://www.npmjs.com/package/@nexusdi/decorators)
[![license](https://img.shields.io/npm/l/@nexusdi/decorators)](https://github.com/NexusDI/core/blob/main/LICENSE)

NestJS-style @Injectable, @Inject and @Module for NexusDI, with standard decorators and no compiler flags.

`@nexusdi/decorators` lets [NexusDI](https://www.npmjs.com/package/@nexusdi/core) classes and modules declare their dependencies the way NestJS code does. Teams moving from NestJS keep the class shapes they know, and need no `experimentalDecorators`.

- `@Injectable({ deps })` lists a constructor's tokens.
- `@Inject(TOKEN)` fills an `accessor` field.
- `@Module({ providers, exports })` turns a class into a module.
- Runs under tsc, TypeScript 7, esbuild, SWC, Babel, Bun, Deno and Vite with its Babel plugin.
- Vite on its own and Node's type stripping cannot run them.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/decorators@next @nexusdi/core@next
```

## Usage

<!-- #region injectable -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { Injectable, Module } from '@nexusdi/decorators';

interface IBridge {
  readonly callsign: string;
}
const CALLSIGN = new Token<string>('Callsign');
const BRIDGE = new Token<IBridge>('Bridge');

@Injectable({ deps: [CALLSIGN] })
class Bridge implements IBridge {
  constructor(readonly callsign: string) {}
}

@Module({
  providers: [
    provide(CALLSIGN, { useValue: 'Meridian' }),
    provide(BRIDGE, { useClass: Bridge }),
  ],
})
class Command {}

await using ship = await Nexus.create(Command);
ship.get(BRIDGE).callsign; // -> 'Meridian'
```

<!-- #endregion injectable -->

## Field injection

<!-- #region inject -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { Inject } from '@nexusdi/decorators';

interface IHelm {
  readonly callsign: string;
}
const CALLSIGN = new Token<string>('Callsign');
const HELM = new Token<IHelm>('Helm');
class Helm implements IHelm {
  @Inject(CALLSIGN) accessor callsign!: string;
}
await using ship = await Nexus.create([
  provide(CALLSIGN, { useValue: 'Meridian' }),
  provide(HELM, { useClass: Helm }),
]);
ship.get(HELM).callsign; // -> 'Meridian'
```

<!-- #endregion inject -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/decorators/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
