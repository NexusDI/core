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

## The transient check

`react()` reads the graph when the container starts. Outside render, `ship.get` still builds a transient on every call.

<!-- #region transient -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { react } from '@nexusdi/react';

interface ISurveyDrone {
  launch(): string;
}
class ScoutDrone implements ISurveyDrone {
  launch() {
    return 'scout';
  }
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

const ship = await Nexus.create(
  [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
  { plugins: [react()] },
);
ship.get(DRONE).launch(); // -> 'scout'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion transient -->

In a component, `useService(DRONE)` throws `NEXUS_REACT_TRANSIENT_IN_RENDER`, because a transient read in render would build a new instance on every render.
