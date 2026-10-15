# @nexusdi/hono examples

## A scoped service built from the request

The request mapping turns Hono's context into the mission, and a scoped service reads it through `REQUEST`.

<!-- #region getting-started -->

```ts @import.meta.vitest
import {
  Nexus,
  REQUEST,
  Token,
  provide,
  type NexusRequest,
} from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface IGreeter {
  greet(): string;
}
const GREETER = new Token<IGreeter>('Greeter');
class MissionGreeter implements IGreeter {
  static deps = [REQUEST] as const;
  constructor(private readonly request: NexusRequest) {}
  greet() {
    return `Hello, ${this.request.mission.id}`;
  }
}

const ship = await Nexus.create([
  provide(GREETER, { useClass: MissionGreeter, lifetime: 'scoped' }),
]);
const di = nexus(ship, {
  request: (c) => ({
    mission: { id: c.req.query('mission') ?? 'crew', target: 'Kepler-442b' },
  }),
});

const app = new Hono().use(di.middleware).get(
  '/',
  di.inject({ greeter: GREETER }, ({ greeter }, c) => c.text(greeter.greet())),
);
const greeting = await (await app.request('/')).text(); // -> 'Hello, crew'
await ship[Symbol.asyncDispose]();
```

<!-- #endregion getting-started -->
