# @nexusdi/testing

[![npm](https://img.shields.io/npm/v/@nexusdi/testing/next)](https://www.npmjs.com/package/@nexusdi/testing)
[![license](https://img.shields.io/npm/l/@nexusdi/testing)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Type-safe provider overrides for integration testing.**

Testing components that depend on complex services (like databases or APIs) is difficult if you have to set up the entire production environment.

`@nexusdi/testing` allows you to build your real production module graph but "swap out" specific providers for fakes or stubs.

## Core Features

- **Real Graph Validation:** Unlike simple mocks, `createTestingContainer` runs the full NexusDI compiler. If your override breaks the graph, the test fails at startup.
- **Precision Overrides:** Replace a single provider or an entire module.
- **Immutable Builders:** Every `.override()` call returns a new builder, allowing you to share a base configuration across many tests.

## Installation

```bash
npm install -D @nexusdi/testing@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(NAV_CHARTS, { useClass: RealCharts })],
  exports: [NAV_CHARTS],
});

const fakeCharts = { plot: () => 'loopback' };

await using ship = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();

console.log(ship.get(NAV_CHARTS).plot('anywhere')); // -> 'loopback'
```

## Documentation
- [Testing Guide](https://nexus.js.org/next/testing/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License
MIT
