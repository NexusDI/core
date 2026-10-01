# @nexusdi/testing

[![npm](https://img.shields.io/npm/v/@nexusdi/testing/next)](https://www.npmjs.com/package/@nexusdi/testing) [![license](https://img.shields.io/npm/l/@nexusdi/testing)](https://github.com/NexusDI/core/blob/main/LICENSE)

Build your real NexusDI module graph in tests, with the providers you name replaced.

`createTestingContainer()` builds the [NexusDI](https://www.npmjs.com/package/@nexusdi/core) module graph your app runs, with a fake for each provider you override. The test runs the production compiler, so an override that breaks the graph fails the same way.

- `override(token, { useValue })` replaces one provider.
- `overrideModule(module, stub)` replaces a module wherever the graph imports it.
- An override keeps the lifetime of the binding it replaces.
- Each `override()` returns a new builder, so tests share a base.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

```bash
npm install -D @nexusdi/testing@next @nexusdi/core@next
```

## Usage

<!-- #region testing -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (): Promise<INavCharts> => {
        throw new Error('no subspace link in tests');
      },
    }),
  ],
  exports: [NAV_CHARTS],
});

const fakeCharts: INavCharts = { plot: () => 'loopback' };
await using ship = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create({ onInit: false });
ship.get(NAV_CHARTS).plot('anywhere'); // -> 'loopback'
```

<!-- #endregion testing -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/testing/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
