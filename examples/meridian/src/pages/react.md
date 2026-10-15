# Use services in React components examples

Regions for `apps/docs/content/react.mdx`. Every block runs as a test on Node and renders on the server with `react-dom/server`. The browser-side regions sit in `libs/react/docs/guide.md`, which runs in jsdom.

<!-- #region provider -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

function StarMap() {
  const charts = useService(NAV_CHARTS); // INavCharts
  const course = charts.plot('Kepler-442b');
  return createElement('p', null, `${course.to} at ${course.heading}`);
}

const ship = await Nexus.create(Tactical);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(StarMap),
);
const html = renderToString(page); // -> '<p>Kepler-442b at 42</p>'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion provider -->

<!-- #region promise -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { Suspense, createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

function StarMap() {
  return createElement(
    'p',
    null,
    useService(NAV_CHARTS).plot('Kepler-442b').to,
  );
}

// Created once, at module level: a promise made in render is new each render.
const shipReady = Nexus.create(Tactical);

const stream = await renderToReadableStream(
  createElement(
    Suspense,
    { fallback: createElement('p', null, 'Powering up') },
    createElement(
      NexusProvider,
      { container: shipReady },
      createElement(StarMap),
    ),
  ),
);
await stream.allReady;
const html = await new Response(stream).text();
const rendered = html.includes('<p>Kepler-442b</p>'); // -> true
await (await shipReady)[Symbol.asyncDispose]();
```

<!-- #endregion promise -->

<!-- #region transient -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { NexusProvider, react, useService } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface ISurveyDrone {
  launch(): string;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');
class ScoutDrone implements ISurveyDrone {
  launch() {
    return 'scout';
  }
}
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
});

function DroneBay() {
  return createElement('p', null, useService(DRONE).launch());
}

const dev = true; // the app's own flag: true in development and tests
const ship = await Nexus.create(Tactical, { plugins: dev ? [react()] : [] });

let code = '';
try {
  renderToString(
    createElement(NexusProvider, { container: ship }, createElement(DroneBay)),
  );
} catch (error) {
  if (isNexusError(error, 'NEXUS_REACT_TRANSIENT_IN_RENDER'))
    code = `${error.code} ${error.token}`;
}
const refused = code; // -> 'NEXUS_REACT_TRANSIENT_IN_RENDER SurveyDrone'
console.log(refused);
await ship[Symbol.asyncDispose]();
```

<!-- #endregion transient -->

<!-- #region scope-fallback -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { NexusProvider, ScopeProvider } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

const ship = await Nexus.create(Tactical);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(ScopeProvider, {
    request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    fallback: createElement('p', null, 'Docking'),
  }),
);
const html = renderToString(page); // -> '<p>Docking</p>'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion scope-fallback -->

<!-- #region section-fallback -->

```ts @import.meta.vitest
import { Nexus, defineModule } from '@nexusdi/core';
import { NexusProvider, SectionBoundary, lazySection } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

// Declared once, at module level, so its identity holds across renders.
const Cartography = lazySection('cartography', async () =>
  defineModule({ name: 'Cartography' }),
);

const ship = await Nexus.create([]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(SectionBoundary, {
    section: Cartography,
    fallback: createElement('p', null, 'Loading charts'),
  }),
);
const html = renderToString(page); // -> '<p>Loading charts</p>'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion section-fallback -->
