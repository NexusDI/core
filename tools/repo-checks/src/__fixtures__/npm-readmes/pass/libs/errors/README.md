# @nexusdi/errors

[![npm](https://img.shields.io/npm/v/@nexusdi/errors/next)](https://www.npmjs.com/package/@nexusdi/errors)
[![license](https://img.shields.io/npm/l/@nexusdi/errors)](https://github.com/NexusDI/core/blob/main/LICENSE)

Every NexusDI error explained, with the fix and the provider you probably meant.

`errors()` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that gives every error its full text.

- Each message names the provider you probably meant.
- Each message ends with the line that fixes it.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

```bash
npm install @nexusdi/errors@next @nexusdi/core@next
```

## Usage

<!-- #region errors -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Bridge = defineModule({
  name: 'Bridge',
  providers: [provide(NAV_CHARTS, { useFactory: () => ({ plot: (to: string) => to }) })],
});
const app = await Nexus.create(Bridge, { plugins: [errors()] });
app.get(NAV_CHARTS).plot('Vega'); // -> 'Vega'
```

<!-- #endregion errors -->

## Explain

<!-- #region explain -->

```ts @import.meta.vitest
const text = 'Fix: export NavCharts';
text.startsWith('Fix'); // -> true
```

<!-- #endregion explain -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/errors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
