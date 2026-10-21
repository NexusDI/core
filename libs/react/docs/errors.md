# @nexusdi/react error examples

Regions for the `NEXUS_REACT_NESTED_SCOPE`, `NEXUS_REACT_SECTION_CONFLICT` and `NEXUS_REACT_SECTION_FAILED` pages. Each error is raised in a browser render, so these blocks run in jsdom with `@testing-library/react`.

<!-- #region nested-reproduce -->

```ts @import.meta.vitest
import { Nexus, isNexusError } from '@nexusdi/core';
import { NexusProvider, ScopeProvider } from '@nexusdi/react';
import { act, cleanup, render } from '@testing-library/react';
import { Component, createElement, type ReactNode } from 'react';

let caught: unknown;
class Catch extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    caught = error;
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const ship = await Nexus.create([]);
// The inner console sits inside the outer console's scope.
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(
    Catch,
    null,
    createElement(
      ScopeProvider,
      null,
      createElement(ScopeProvider, null, createElement('p', null, 'inner')),
    ),
  ),
);
await act(async () => {
  render(page);
});
const code = isNexusError(caught) ? caught.code : ''; // -> 'NEXUS_REACT_NESTED_SCOPE'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion nested-reproduce -->

<!-- #region nested-fix -->

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';
import { NexusProvider, ScopeProvider } from '@nexusdi/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

const ship = await Nexus.create([]);
// Two consoles side by side: each ScopeProvider holds a scope of its own.
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(ScopeProvider, null, createElement('p', null, 'survey-7')),
  createElement(ScopeProvider, null, createElement('p', null, 'survey-8')),
);
await act(async () => {
  render(page);
});
const shown = (await screen.findByText('survey-8')).textContent; // -> 'survey-8'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion nested-fix -->

<!-- #region conflict-reproduce -->

```ts @import.meta.vitest
import { Nexus, defineModule, isNexusError } from '@nexusdi/core';
import { NexusProvider, SectionBoundary, lazySection } from '@nexusdi/react';
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';

let caught: unknown;
function Failed({ error }: { error: unknown; retry(): void }) {
  caught = error;
  return null;
}

// Two teams picked the section name 'navigation' for different modules.
const Charts = lazySection('navigation', async () =>
  defineModule({ name: 'Charts' }),
);
const Routes = lazySection('navigation', async () =>
  defineModule({ name: 'Routes' }),
);

const ship = await Nexus.create([]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(SectionBoundary, { section: Charts, errorFallback: Failed }),
  createElement(SectionBoundary, { section: Routes, errorFallback: Failed }),
);
await act(async () => {
  render(page);
});
// A const narrows; `caught` is a let the fallback assigns.
const error = caught;
const conflict = isNexusError(error, 'NEXUS_REACT_SECTION_CONFLICT');
const section = conflict ? error.section : ''; // -> 'navigation'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion conflict-reproduce -->

<!-- #region conflict-fix -->

```ts @import.meta.vitest
import { Nexus, defineModule } from '@nexusdi/core';
import { NexusProvider, SectionBoundary, lazySection } from '@nexusdi/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

// Each lazySection has a name of its own.
const Charts = lazySection('charts', async () =>
  defineModule({ name: 'Charts' }),
);
const Routes = lazySection('routes', async () =>
  defineModule({ name: 'Routes' }),
);

const ship = await Nexus.create([]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(
    SectionBoundary,
    { section: Charts },
    createElement('p', null, 'charts'),
  ),
  createElement(
    SectionBoundary,
    { section: Routes },
    createElement('p', null, 'routes'),
  ),
);
await act(async () => {
  render(page);
});
const shown = (await screen.findByText('routes')).textContent; // -> 'routes'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion conflict-fix -->

<!-- #region failed-reproduce -->

```ts @import.meta.vitest
import { Nexus, isNexusError } from '@nexusdi/core';
import { NexusProvider, SectionBoundary, lazySection } from '@nexusdi/react';
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';

// The remote that serves the cartography section is down.
const Cartography = lazySection('cartography', async () => {
  throw new Error('remote unreachable');
});
function Failed() {
  return createElement('p', null, 'Cartography is offline.');
}

let logged: unknown;
const ship = await Nexus.create([]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(SectionBoundary, {
    section: Cartography,
    errorFallback: Failed,
  }),
);
await act(async () => {
  // React hands onCaughtError what the boundary caught.
  render(page, { onCaughtError: (error) => (logged = error) });
});
const error = logged;
const failed = isNexusError(error, 'NEXUS_REACT_SECTION_FAILED');
const section = failed ? error.section : ''; // -> 'cartography'
const cause = failed ? (error.cause as Error).message : ''; // -> 'remote unreachable'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion failed-reproduce -->

<!-- #region failed-fix -->

```ts @import.meta.vitest
import { Nexus, defineModule } from '@nexusdi/core';
import { NexusProvider, SectionBoundary, lazySection } from '@nexusdi/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

// The first import fails, and the remote is back for the second one.
let attempts = 0;
const Cartography = lazySection('cartography', async () => {
  attempts += 1;
  if (attempts === 1) throw new Error('remote unreachable');
  return defineModule({ name: 'Cartography' });
});
function Failed({ retry }: { error: unknown; retry(): void }) {
  return createElement('button', { type: 'button', onClick: retry }, 'Retry');
}

const ship = await Nexus.create([]);
const page = createElement(
  NexusProvider,
  { container: ship },
  createElement(
    SectionBoundary,
    { section: Cartography, errorFallback: Failed },
    createElement('p', null, 'charts'),
  ),
);
await act(async () => {
  render(page, { onCaughtError: () => undefined });
});
await act(async () => (await screen.findByRole('button')).click());
const shown = (await screen.findByText('charts')).textContent; // -> 'charts'
cleanup();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion failed-fix -->
