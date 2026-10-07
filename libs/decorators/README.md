# @nexusdi/decorators

[![npm](https://img.shields.io/npm/v/@nexusdi/decorators/next)](https://www.npmjs.com/package/@nexusdi/decorators)
[![license](https://img.shields.io/npm/l/@nexusdi/decorators)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Declarative dependency injection for NexusDI.**

`@nexusdi/decorators` provides a high-level, declarative syntax for defining dependencies and modules, mirroring the style of NestJS while remaining compatible with standard TypeScript decorators.

## Why use decorators?

If you are migrating from NestJS or simply prefer a more visual way to declare dependencies, decorators move the dependency list from a `static deps` array into `@Injectable({ deps })`, and turn a class into a module in place of a `defineModule` call.

- **`@Injectable({ deps })`**: Declares a class's constructor dependencies.
- **`@Inject(TOKEN)`**: Injects a dependency into a class `accessor` field.
- **`@Module({ ... })`**: Turns a class into a NexusDI module.

## Key Advantage: No Compiler Flags

Unlike traditional metadata-based DI, `@nexusdi/decorators` are standard TC39 decorators. They do **not** require `experimentalDecorators` or `emitDecoratorMetadata` in your `tsconfig.json`.

This means your code compiles with:

- **tsc / TypeScript 7 / esbuild / SWC / Babel**
- **Bun / Deno**
- **Vite with its Babel plugin**

Plain Vite and Node's type stripping cannot run these decorators.

## Installation

```bash
npm install @nexusdi/decorators@next @nexusdi/core@next
```

## Quick Example

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

## Documentation

- [Decorators Guide](https://nexus.js.org/next/decorators/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
