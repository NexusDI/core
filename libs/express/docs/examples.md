# @nexusdi/express examples

## A route test with a testing container

`createBridge(ship)` builds the app from a container, so a test passes a testing container with fakes and reaches the route on a port-0 server.

<!-- #region route-test -->

```ts @import.meta.vitest
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Token, provide } from '@nexusdi/core';
import { nexus, type ContainerSource } from '@nexusdi/express';
import { createTestingContainer } from '@nexusdi/testing';
import express from 'express';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

function createBridge(ship: ContainerSource) {
  const di = nexus(ship);
  return express()
    .use(di.middleware)
    .get(
      '/course/:to',
      di.inject({ charts: NAV_CHARTS }, ({ charts }, req, res) => {
        res.json(charts.plot(String(req.params.to)));
      }),
    );
}

const ship = await createTestingContainer({
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: () => ({ to: '', heading: 0 }) } }),
  ],
})
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const server = createBridge(ship).listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
const res = await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
const course = await res.json(); // -> { to: 'Kepler-442b', heading: 42 }
server.close();
await ship[Symbol.asyncDispose]();
```

<!-- #endregion route-test -->
