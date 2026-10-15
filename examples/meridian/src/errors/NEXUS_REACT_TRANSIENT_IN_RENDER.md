# NEXUS_REACT_TRANSIENT_IN_RENDER examples

Regions for `apps/docs/content/errors/NEXUS_REACT_TRANSIENT_IN_RENDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

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
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts, lifetime: 'transient' }),
  ],
});

function StarMap() {
  return createElement(
    'p',
    null,
    useService(NAV_CHARTS).plot('Kepler-442b').to,
  );
}

const ship = await Nexus.create(Tactical, { plugins: [react()] });
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(StarMap),
);
let code = '';
try {
  renderToString(page);
} catch (error) {
  if (isNexusError(error, 'NEXUS_REACT_TRANSIENT_IN_RENDER'))
    code = `${error.code} ${error.token}`;
}
const refused = code; // -> 'NEXUS_REACT_TRANSIENT_IN_RENDER NavCharts'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { NexusProvider, react, useService } from '@nexusdi/react';
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
// A singleton: every render reads the one instance.
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

const ship = await Nexus.create(Tactical, { plugins: [react()] });
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(StarMap),
);
const html = renderToString(page); // -> '<p>Kepler-442b</p>'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion fix -->
