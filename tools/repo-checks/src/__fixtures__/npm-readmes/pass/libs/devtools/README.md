# @nexusdi/devtools

[![npm](https://img.shields.io/npm/v/@nexusdi/devtools/next)](https://www.npmjs.com/package/@nexusdi/devtools)
[![license](https://img.shields.io/npm/l/@nexusdi/devtools)](https://github.com/NexusDI/core/blob/main/LICENSE)

Draw your NexusDI module graph and follow every instance the container builds.

`devtools()` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that returns the compiled graph as JSON and draws it.

- `graph()` returns the module graph as plain JSON.
- `toMermaid()` and `toDot()` draw it.
- `inspect()` lists every instance the container built.
- `trace()` reports each lifecycle event.

<img src="https://raw.githubusercontent.com/NexusDI/core/refs/tags/@nexusdi/core@0.4.0-rc.1/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: Bridge imports Engineering" width="720">

Drawn with `npx nexusdi graph src/meridian.module.ts#Bridge -f svg`.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

```bash
npm install @nexusdi/devtools@next @nexusdi/core@next
```

## Usage

<!-- #region devtools -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Bridge = defineModule({
  name: 'Bridge',
  providers: [provide(NAV_CHARTS, { useFactory: () => ({ plot: (to: string) => to }) })],
});
const app = await Nexus.create(Bridge, { plugins: [devtools()] });
app.get(NAV_CHARTS).plot('Vega'); // -> 'Vega'
```

<!-- #endregion devtools -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/devtools/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
