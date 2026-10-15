# React examples

## A provider and a hook

`useService` reads a token from the container the provider publishes.

<!-- #region provider -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

function Entries() {
  return createElement('p', null, useService(FLIGHT_LOG).entries().join(', '));
}

const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useValue: { entries: () => ['survey-7: docked'] } }),
]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(Entries),
);
renderToString(page); // -> '<p>survey-7: docked</p>'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion provider -->
