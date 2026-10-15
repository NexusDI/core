# @nexusdi/fastify examples

## A route test with a testing container

`fastify.inject()` reaches the route in process, so the test opens no port. The server entry registers `ship[Symbol.asyncDispose]()` as an `onClose` hook, which Fastify runs after in-flight requests drain.

<!-- #region route-test -->

```ts @import.meta.vitest
import { defineModule, provide, Token } from '@nexusdi/core';
import { nexus, type ContainerSource } from '@nexusdi/fastify';
import { createTestingContainer } from '@nexusdi/testing';
import Fastify from 'fastify';

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
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

async function createBridge(ship: ContainerSource) {
  const di = nexus(ship);
  const bridge = Fastify();
  await bridge.register(di.plugin);
  bridge.get<{ Params: { to: string } }>(
    '/course/:to',
    di.inject({ charts: NAV_CHARTS }, ({ charts }, req) =>
      charts.plot(req.params.to),
    ),
  );
  return bridge;
}

const ship = await createTestingContainer(Tactical)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const bridge = await createBridge(ship);
const res = await bridge.inject({ url: '/course/Kepler-442b' });
const course = res.json(); // -> { to: 'Kepler-442b', heading: 42 }
await bridge.close();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion route-test -->
