# @nexusdi/decorators

[![npm](https://img.shields.io/npm/v/@nexusdi/decorators/next)](https://www.npmjs.com/package/@nexusdi/decorators)
[![license](https://img.shields.io/npm/l/@nexusdi/decorators)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Accelerate your development with a declarative, visual syntax for dependency injection.**

Manual dependency lists in `static deps` can become tedious and visually disconnected from the constructor they support. `@nexusdi/decorators` solves this by providing a high-level, declarative syntax that mirrors the style of NestJS while remaining compatible with standard TypeScript decorators.

## Key Features

These decorators utilize standard TC39 specifications to avoid restrictive compiler settings.

- **Standard Decorators**: No `experimentalDecorators` or `emitDecoratorMetadata` required in `tsconfig.json`.
- **Broad Compatibility**: Works with tsc, TypeScript 7, esbuild, SWC, Babel, Bun, Deno, and Vite with its Babel plugin. Plain Vite and Node's type stripping cannot run these decorators.
- **Declarative Toolset**:
  - **`@Injectable({ deps })`**: Defines constructor dependencies.
  - **`@Inject(TOKEN)`**: Enables dependency injection via accessor fields.
  - **`@Module({ ... })`**: Converts a class into a NexusDI module.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/decorators@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { Inject, Injectable, Module } from '@nexusdi/decorators';
interface IBridge {
  readonly callsign: string;
}
interface INavCharts {
  plot(to: string): string;
}
interface IHelm {
  engage(to: string): string;
}
const CALLSIGN = new Token<string>('Callsign');
const BRIDGE = new Token<IBridge>('Bridge');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const HELM = new Token<IHelm>('Helm');
@Injectable({ deps: [CALLSIGN] })
class Bridge implements IBridge {
  constructor(readonly callsign: string) {}
}

// Field injection on an accessor. The Meridian's HelmControl also takes the thrusters and the main drive.
class HelmControl implements IHelm {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;
  engage = (to: string) => this.charts.plot(to);
}

@Module({
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: (to) => `to ${to}` } }),
    provide(HELM, { useClass: HelmControl }),
  ],
  exports: [HELM],
})
class Helm {}

@Module({
  imports: [Helm],
  providers: [
    provide(CALLSIGN, { useValue: 'Meridian' }),
    provide(BRIDGE, { useClass: Bridge }),
  ],
})
class Command {}

await using ship = await Nexus.create(Command);
ship.get(BRIDGE).callsign; // -> 'Meridian'
ship.get(HELM).engage('Vega'); // -> 'to Vega'
```

## Documentation

- [Decorators Guide](https://nexus.js.org/next/decorators/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/decorators/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
