# How do I get a container in every Vitest test? examples

Regions for `apps/docs/content/vitest.mdx`. Each region is a `@module` fence, so it declares its own `test()` calls, and Vitest runs them as tests of this file.

<!-- #region first-test -->

```ts @import.meta.vitest @module
import { Token, defineModule, provide } from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const Meridian = defineModule({
  name: 'Meridian',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

// test/fixtures.ts
const test = nexusTest(base, Meridian, {
  setup: (builder) => builder.override(NAV_CHARTS, { useValue: fakeCharts }),
});

// charts.test.ts
test('plots with the fake charts', ({ nexus }) => {
  nexus.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
});
```

<!-- #endregion first-test -->

<!-- #region override -->

```ts @import.meta.vitest @module
import { REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { describe, test as base } from 'vitest';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const MISSION = new Token<Mission>('Mission');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
const unplottable: INavCharts = {
  plot: () => {
    throw new Error('sector not charted');
  },
};
const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts }),
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

const test = nexusTest(base, Meridian);

describe('on a survey mission', () => {
  test.override('nexusRequest', {
    mission: { id: 'survey-7', target: 'Kepler-442b' },
  });

  test('reads the mission from the test scope', ({ nexusScope }) => {
    nexusScope.get(MISSION).id; // -> 'survey-7'
  });
});

describe('when the charts cannot plot', () => {
  test.override('nexusSetup', [
    (builder) => builder.override(NAV_CHARTS, { useValue: unplottable }),
  ]);

  test('reports an uncharted sector', ({ nexus }) => {
    let reason = '';
    try {
      nexus.get(NAV_CHARTS).plot('Kepler-442b');
    } catch (error) {
      reason = (error as Error).message;
    }
    reason; // -> 'sector not charted'
  });
});
```

<!-- #endregion override -->

<!-- #region file-scope -->

```ts @import.meta.vitest @module
import { defineModule, type Nexus } from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

const Meridian = defineModule({ name: 'Meridian' });
const test = nexusTest(base, Meridian, { containerScope: 'file' });

let first: Nexus | undefined;
test('builds the container for the first test', ({ nexus }) => {
  first = nexus;
});
test('shares it with the next test in the file', ({ nexus }) => {
  nexus === first; // -> true
});
```

<!-- #endregion file-scope -->

<!-- #region compose -->

```ts @import.meta.vitest @module
import { Token, defineModule, provide } from '@nexusdi/core';
import { nexusFixtures } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const Meridian = defineModule({
  name: 'Meridian',
  providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
});

// The fixture map in test.extend, then fixtures of your own on top.
const test = base
  .extend(nexusFixtures(Meridian))
  .extend({ sector: 'Kepler-442b' });

test('plots the sector fixture', ({ nexus, sector }) => {
  nexus.get(NAV_CHARTS).plot(sector).to; // -> 'Kepler-442b'
});
```

<!-- #endregion compose -->

<!-- #region disposal -->

```ts @import.meta.vitest @module
import {
  REQUEST,
  Token,
  defineModule,
  provide,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');
const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

const events: string[] = [];
const test = nexusTest(base, Meridian, {
  create: {
    plugins: [trace((event: TraceEvent) => void events.push(event.type))],
  },
});
test.override('nexusRequest', {
  mission: { id: 'survey-7', target: 'Kepler-442b' },
});
const disposals = () =>
  events.filter((type) => type === 'scope:dispose' || type === 'dispose');

test.fails('fails after it reads the scope', ({ nexusScope }) => {
  nexusScope.get(MISSION);
  events.length = 0;
  throw new Error('sector not charted');
});

test('saw the failed test dispose its scope, then its container', () => {
  disposals(); // -> ['scope:dispose', 'dispose']
});
```

<!-- #endregion disposal -->

<!-- #region oninit-failure -->

```ts @import.meta.vitest @module
import { Token, defineModule, provide } from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface ISubspaceLink {
  hail(): string;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
class SubspaceRelay implements ISubspaceLink {
  onInit() {
    throw new Error('relay offline');
  }
  hail() {
    return 'hail';
  }
}
const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
});

const test = nexusTest(base, Comms, { containerScope: 'file' });

// The first test that reads nexus builds the container, so it owns the failure.
test.fails('fails when onInit rejects the build', ({ nexus }) => {
  nexus.get(SUBSPACE_LINK);
});

test('runs when it reads no fixture', () => {
  1 + 1; // -> 2
});
```

<!-- #endregion oninit-failure -->
