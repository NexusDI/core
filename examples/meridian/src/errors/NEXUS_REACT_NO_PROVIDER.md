# NEXUS_REACT_NO_PROVIDER examples

Regions for `apps/docs/content/errors/NEXUS_REACT_NO_PROVIDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, isNexusError } from '@nexusdi/core';
import { useService } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

function StarMap() {
  const charts = useService(NAV_CHARTS);
  return createElement('p', null, charts.plot('Kepler-442b').to);
}

let code = '';
try {
  renderToString(createElement(StarMap)); // no NexusProvider above StarMap
} catch (error) {
  if (isNexusError(error, 'NEXUS_REACT_NO_PROVIDER'))
    code = `${error.code} ${error.hook}`;
}
const refused = code; // -> 'NEXUS_REACT_NO_PROVIDER useService'
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 7 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

function StarMap() {
  const course = useService(NAV_CHARTS).plot('Kepler-442b');
  return createElement('p', null, `${course.to} at ${course.heading}`);
}

// The test swaps the real charts for the fake, and wraps StarMap in the provider.
const ship = await createTestingContainer(Tactical)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(StarMap),
);
const html = renderToString(page); // -> '<p>Kepler-442b at 42</p>'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion fix -->
