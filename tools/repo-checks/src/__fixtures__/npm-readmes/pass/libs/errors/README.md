# @nexusdi/errors

[![npm](https://img.shields.io/npm/v/@nexusdi/errors/next)](https://www.npmjs.com/package/@nexusdi/errors)
[![license](https://img.shields.io/npm/l/@nexusdi/errors)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Human-readable diagnostics for NexusDI wiring errors.**

NexusDI reports a short error code by default. A developer reading a log needs the full sentence.

`errors()` is a plugin that gives every error its full text.

## Why use this plugin?

- **Actionable Fixes:** Each message ends with the line that fixes it.
- **Near-Miss Analysis:** Each message names the provider you probably meant.

## Installation

```bash
npm install @nexusdi/errors@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
class StarCharts implements INavCharts {
  plot = (to: string) => to;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Bridge = defineModule({
  name: 'Bridge',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});
const app = await Nexus.create(Bridge, { plugins: [errors()] });
app.get(NAV_CHARTS).plot('Vega'); // -> 'Vega'
```

## Documentation

- [Error Text Packs Guide](https://nexus.js.org/next/error-text/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/errors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
