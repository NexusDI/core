# How do I scope requests outside Node? examples

Regions for `apps/docs/content/scope-context.mdx`. Every block runs as a test.

<!-- #region custom -->

```ts @import.meta.vitest
import {
  Nexus,
  REQUEST,
  Token,
  defineModule,
  provide,
  type Scope,
} from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

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

// One scope at a time, in a plain variable: no AsyncLocalStorage needed.
let active: Scope | undefined;
const scopes = {
  run<R>(scope: Scope, fn: () => R): R {
    const previous = active;
    active = scope;
    try {
      return fn();
    } finally {
      active = previous;
    }
  },
  current: (): Scope | undefined => active,
};

const ship = await Nexus.create(Tactical);
const di = nexus(ship, {
  scopes,
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

// A synchronous handler reads the scope before run() returns.
const app = new Hono()
  .use(di.middleware)
  .get('/mission', (c) => c.text(scopes.current()?.get(MISSION).id ?? 'none'));

const reply = await (await app.request('/mission')).text(); // -> 'survey-7'
const after = scopes.current(); // -> undefined
await ship[Symbol.asyncDispose]();
```

<!-- #endregion custom -->
