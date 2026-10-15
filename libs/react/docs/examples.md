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

## The root container in an effect

`useContainer` returns the root container, also under a `ScopeProvider`, for work an effect starts, such as a scope of its own.

<!-- #region root-container -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { NexusProvider, useContainer } from '@nexusdi/react';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement, useEffect, useState } from 'react';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
class MemoryFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

function LogPanel() {
  const ship = useContainer();
  const [entries, setEntries] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      const scope = await ship.createScope();
      const log = scope.get(FLIGHT_LOG);
      log.record('survey-7: docked');
      log.record('survey-7: sampled');
      if (live) setEntries(log.entries().join(', '));
      await scope[Symbol.asyncDispose]();
    })();
    return () => {
      live = false;
    };
  }, [ship]);
  return createElement('p', null, entries);
}

const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: MemoryFlightLog, lifetime: 'scoped' }),
]);
render(
  createElement(NexusProvider, { container: ship }, createElement(LogPanel)),
);
const panel = await screen.findByText(/sampled/);
panel.textContent; // -> 'survey-7: docked, survey-7: sampled'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion root-container -->
