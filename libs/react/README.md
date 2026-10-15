# @nexusdi/react

[![npm](https://img.shields.io/npm/v/@nexusdi/react/next)](https://www.npmjs.com/package/@nexusdi/react)
[![license](https://img.shields.io/npm/l/@nexusdi/react)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give React components the services of a NexusDI container.**

A React app that uses a container writes the same glue in every team: a context and a hook around `get()`, a scope per dialog, a fallback while a lazy section loads. `@nexusdi/react` is that glue, over a container your app creates.

## How It Works

`NexusProvider` publishes a container, or the promise `Nexus.create` returns, and `useService(TOKEN)` reads a service with core's synchronous `get()`. A component under no provider gets an error that names its hook, and an error from `get()` reaches the nearest error boundary unchanged.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/react@next @nexusdi/core@next react
```

## Quick Example

The app creates the container, and `NexusProvider` publishes it to every component below.

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

function Heading() {
  const charts = useService(NAV_CHARTS);
  return createElement('p', null, charts.plot('Kepler-442b').heading);
}

const ship = await Nexus.create([
  provide(NAV_CHARTS, { useClass: StarCharts }),
]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(Heading),
);
renderToString(page); // -> '<p>42</p>'
await ship[Symbol.asyncDispose]();
```

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/react/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
