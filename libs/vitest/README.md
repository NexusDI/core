# @nexusdi/vitest

[![npm](https://img.shields.io/npm/v/@nexusdi/vitest/next)](https://www.npmjs.com/package/@nexusdi/vitest)
[![license](https://img.shields.io/npm/l/@nexusdi/vitest)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Get a NexusDI testing container and scope in every Vitest test, disposed after it.**

Every test file that exercises the real module graph builds a testing container, overrides a few providers and disposes it. A test that forgets `await using` never disposes it, so its providers' disposers never run.

## Fixtures for the module graph

`nexusTest(base, root, { setup })` returns Vitest's `test` with two fixtures: `nexus`, a testing container built on first use, and `nexusScope`, a scope of it. Vitest disposes the scope, then the container, when the test ends, pass or fail. A suite swaps the overrides or the request with `test.override`.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install -D @nexusdi/vitest@next @nexusdi/testing@next @nexusdi/core@next vitest
```

It works with Vitest 4.1 or later, Vitest 5 included, on Node 22.12 or later with TypeScript 5.4 or later.

## Quick Example

```ts @import.meta.vitest @module
import { defineModule, provide, Token } from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

const test = nexusTest(base, Tactical, {
  setup: (builder) => builder.override(NAV_CHARTS, { useValue: fakeCharts }),
});

test('plots a course with the fake charts', ({ nexus }) => {
  nexus.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
});
```

## Documentation

- [How do I get a container in every Vitest test?](https://nexus.js.org/next/vitest/)
- [How do I replace a provider in a test?](https://nexus.js.org/next/testing/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/vitest/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
