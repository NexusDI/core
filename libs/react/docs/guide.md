# @nexusdi/react guide examples

Regions for `apps/docs/content/react.mdx` that run in the browser. This package's tests run in jsdom, so every block renders on the client with `@testing-library/react`.

<!-- #region scope-key -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, provide } from '@nexusdi/core';
import { NexusProvider, ScopeProvider, useService } from '@nexusdi/react';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[];
  constructor(mission: Mission) {
    this.#entries = [`${mission.id}: docked`];
  }
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

const ship = await Nexus.create([
  provide(MISSION, {
    useFactory: (request) => request.mission,
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);

function FlightLogPanel() {
  return createElement('p', null, useService(FLIGHT_LOG).entries().join(', '));
}
// A new mission id remounts the ScopeProvider, which creates a new scope.
const surveyConsole = (id: string) =>
  createElement(
    NexusProvider,
    { container: ship },
    createElement(
      ScopeProvider,
      {
        key: id,
        request: { mission: { id, target: 'Kepler-442b' } },
        fallback: createElement('p', null, 'Docking'),
      },
      createElement(FlightLogPanel),
    ),
  );

const view = render(surveyConsole('survey-7'));
const first = (await screen.findByText('survey-7: docked')).textContent; // -> 'survey-7: docked'
view.rerender(surveyConsole('survey-8'));
const second = (await screen.findByText('survey-8: docked')).textContent; // -> 'survey-8: docked'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion scope-key -->

<!-- #region section-retry -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import {
  NexusProvider,
  SectionBoundary,
  lazySection,
  useService,
} from '@nexusdi/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Cartography = defineModule({
  name: 'Cartography',
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 42 }) } }),
  ],
  exports: [NAV_CHARTS],
});

let attempts = 0;
const failures: unknown[] = [];
// The first import fails, as a remote that is down would.
const CartographySection = lazySection('cartography', async () => {
  attempts += 1;
  if (attempts === 1) throw new Error('remote unreachable');
  return Cartography;
});

function StarMap() {
  return createElement(
    'p',
    null,
    useService(NAV_CHARTS).plot('Kepler-442b').to,
  );
}
function SectionFailed({ retry }: { error: unknown; retry(): void }) {
  return createElement('button', { onClick: retry }, 'Retry');
}

const ship = await Nexus.create([]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(
    SectionBoundary,
    {
      section: CartographySection,
      fallback: createElement('p', null, 'Loading charts'),
      errorFallback: SectionFailed,
      onError: (error: unknown) => void failures.push(error),
    },
    createElement(StarMap),
  ),
);
// act() lets React finish the load, the failure and the retry.
await act(async () => {
  render(page);
});
const retry = await screen.findByText('Retry');
await act(async () => retry.click());
const shown = (await screen.findByText('Kepler-442b')).textContent; // -> 'Kepler-442b'
const tries = attempts; // -> 2
const reported = failures.length; // -> 1
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion section-retry -->
