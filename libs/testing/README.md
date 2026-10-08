# @nexusdi/testing

[![npm](https://img.shields.io/npm/v/@nexusdi/testing/next)](https://www.npmjs.com/package/@nexusdi/testing)
[![license](https://img.shields.io/npm/l/@nexusdi/testing)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Simplify integration tests with type-safe provider overrides.**

Integration testing often becomes a burden when components depend on complex services like databases or external APIs. Setting up a full production environment for every test is slow and fragile, while manually mocking every dependency leads to tests that pass even when the real application graph is broken.

`@nexusdi/testing` solves this by allowing you to instantiate your real production module graph and surgically swap specific providers for fakes or stubs.

## Key Features

The library provides high-fidelity simulation of your dependency graph.

- **Real Graph Validation:** `createTestingContainer` runs the full NexusDI compiler to ensure overrides do not break the graph.
- **Precision Overrides:** Replace single providers with `override()` or entire modules with `overrideModule(module, stub)`.
- **Lifetime Preservation:** An override maintains the lifetime of the original binding it replaces.
- **Immutable Builders:** Every `.override()` call returns a new builder for shared base configurations.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install -D @nexusdi/testing@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface INavCharts {
  plot(to: string): string;
}

class SubspaceCharts implements INavCharts {
  plot(): string {
    throw new Error('no subspace link in tests');
  }
}

const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(NAV_CHARTS, { useClass: SubspaceCharts })],
  exports: [NAV_CHARTS],
});

const fakeCharts: INavCharts = { plot: () => 'loopback' };

await using ship = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();

ship.get(NAV_CHARTS).plot('anywhere'); // -> 'loopback'
```

## Documentation

- [Testing Guide](https://nexus.js.org/next/testing/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/testing/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
